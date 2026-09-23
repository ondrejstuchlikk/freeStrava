import { readActivityFile } from "./parsers/index.js";
import { localIso } from "./activity.js";
import { analyze, isFoot, isRun } from "./analysis.js";
import { store } from "./store.js";
import {
  resolveSettings, fitnessSeries, volumeByPeriod, weeklyLoad, activityLoad,
  dayOf, sportOf, addDays, fmtDuration, fmtPace, parsePace, fmtDay,
} from "./metrics.js";
import {
  drawFitness, drawForm, drawWeeklyLoad, drawVolume, drawStreams, drawPowerCurve, seriesColor,
} from "./charts.js";
import { drawMap, mapHover, destroyMap } from "./map.js";
import { download, toCsv } from "./export.js";
import { demoActivity, demoHistory } from "./demo.js";
import { t, num, locale, getLang, setLang, sportName, applyTranslations, LANGS } from "./i18n.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const SETTINGS_KEY = "freestrava.settings";
const LANG_KEY = "freestrava.lang";
const ZONE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#184f95", "#104281", "#0d366b"];

const state = {
  summaries: [],     // oldest first
  userSettings: {},
  settings: null,    // resolved (estimates filled in)
  estimated: {},
  current: null,     // { summary, act, an }
  demo: false,
  mapMode: "speed",
  fitnessRange: 182,
  volume: { period: "week", metric: "distance", sport: "all" },
  pendingStravaId: null,
  awayForFile: false, // user left for Strava; highlight step 2 when they return
};

// ================= boot & routing =================

async function boot() {
  initLanguage();
  wireHandlers();
  trackTopbarHeight();
  state.userSettings = loadUserSettings();
  try {
    state.summaries = sortByDate(await store.allSummaries());
  } catch {
    toast(t("toast.storage"));
  }
  resolve();
  addEventListener("hashchange", route);
  route();
}

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [view, arg] = h.split("/");
  state.demo = view === "demo";
  $$(".view").forEach((v) => (v.hidden = true));
  $$(".nav a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.view === (view || "home"))));
  destroyMap();
  scrollTo(0, 0);

  if (view === "a" && arg) return openActivity(decodeURIComponent(arg));
  if (view === "demo") return openDemo();
  if (view === "fitness") { show("fitness"); return renderFitness(); }
  if (view === "trends") { show("trends"); return renderTrends(); }
  show("home");
  renderHome();
}

function show(id) {
  $(`#view-${id}`).hidden = false;
}

function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

// ================= language =================

function initLanguage() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
  setLang(LANGS.includes(saved) ? saved : "cs"); // Czech by default
  applyTranslations();
  updateLangButtons();
}

function switchLanguage(lang) {
  if (lang === getLang()) return;
  setLang(lang);
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  applyTranslations();
  updateLangButtons();
  setDeviceMode(document.body.classList.contains("phone"));
  setStravaLink($("#strava-link").value);
  $("#vol-sport").dataset.sig = ""; // rebuild translated sport options
  route();
}

function updateLangButtons() {
  $$(".lang-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
}

/** Sticky elements sit under the header, whose height changes on phones. */
function trackTopbarHeight() {
  const bar = $(".topbar");
  const set = () => document.documentElement.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
  set();
  if (window.ResizeObserver) new ResizeObserver(set).observe(bar);
}

// ================= settings =================

function loadUserSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}

/** Resolve settings from history; returns true if the result changed. */
function resolve() {
  const before = JSON.stringify(state.settings);
  const { settings, estimated } = resolveSettings(state.summaries, state.userSettings);
  state.settings = settings;
  state.estimated = estimated;
  return before !== JSON.stringify(settings);
}

/** Re-analyse stored activities after settings change (zones/load depend on them). */
async function reanalyzeAll() {
  const updated = [];
  for (const s of state.summaries) {
    const rec = await store.getStreams(s.id).catch(() => null);
    if (!rec) continue;
    const an = analyze(rec.act, state.settings);
    updated.push({ ...s, ...summaryFields(rec.act, an) });
    await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  if (updated.length) {
    await store.putSummaries(updated);
    const byId = new Map(updated.map((u) => [u.id, u]));
    state.summaries = state.summaries.map((s) => byId.get(s.id) || s);
  }
}

function openSettings() {
  const u = state.userSettings, r = state.settings;
  $("#set-maxhr").value = u.maxHr || "";
  $("#set-maxhr").placeholder = `${r.maxHr}${state.estimated.maxHr ? t("set.estimate") : ""}`;
  $("#set-resthr").value = u.restHr || "";
  $("#set-resthr").placeholder = String(r.restHr);
  $("#set-sex").value = String(r.trimpK);
  $("#set-pace").value = u.thresholdPace ? fmtPace(u.thresholdPace) : "";
  $("#set-pace").placeholder = `${fmtPace(r.thresholdPace)}${state.estimated.thresholdPace ? t("set.estimate") : ""}`;
  $("#set-ftp").value = u.ftp || "";
  $("#settings").showModal();
}

async function saveSettings(e) {
  e.preventDefault();
  const num = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) && v > 0 ? v : null; };
  const paceStr = $("#set-pace").value.trim();
  const pace = parsePace(paceStr);
  if (paceStr && !pace) {
    $("#set-pace").setCustomValidity(t("set.paceInvalid"));
    $("#set-pace").reportValidity();
    return;
  }
  state.userSettings = {
    maxHr: num("#set-maxhr"), restHr: num("#set-resthr"), trimpK: parseFloat($("#set-sex").value),
    thresholdPace: pace, ftp: num("#set-ftp"),
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.userSettings)); } catch { /* private mode */ }
  $("#settings").close();
  if (resolve()) {
    toast(t("toast.recalc"));
    await reanalyzeAll();
    toast(t("toast.updated"));
  }
  route();
}

// ================= adding files =================

// ---- step 1: getting the file from Strava ----
//
// Phones: strava.com/activities/* and /athlete/* are "universal links" /
// Android app links, so tapping them opens the Strava app (which can't
// export). /login opens in the browser, and URLs pasted into the address
// bar never trigger the app — hence "Copy download link" on phones.

const DEVICE_KEY = "freestrava.device";

function detectPhone() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved === "phone";
  } catch { /* ignore */ }
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function setDeviceMode(phone, remember = false) {
  document.body.classList.toggle("phone", phone);
  $("#switch-device").textContent = phone ? t("switch.toDesktop") : t("switch.toPhone");
  if (remember) try { localStorage.setItem(DEVICE_KEY, phone ? "phone" : "computer"); } catch { /* ignore */ }
}

function exportUrl(id) {
  return `https://www.strava.com/activities/${id}/export_original`;
}

function setStravaLink(value) {
  const v = (value || "").trim();
  const m = /strava\.com\/activities\/(\d+)/.exec(v);
  const hint = $("#link-hint");
  $("#link-ready").hidden = !m;
  if (m) {
    state.pendingStravaId = m[1];
    $("#strava-download").href = exportUrl(m[1]);
    $("#download-url").value = exportUrl(m[1]);
    hint.textContent = "";
    return true;
  }
  state.pendingStravaId = null;
  hint.textContent = !v ? "" : /strava\.app\.link|strava\.com\/share/.test(v) ? t("link.share") : t("link.invalid");
  return false;
}

async function pasteLink() {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    $("#link-hint").textContent = t("clipboard.fail");
    $("#strava-link").focus();
    return;
  }
  $("#strava-link").value = text.trim();
  if (setStravaLink(text) && document.body.classList.contains("phone")) $("#copy-download").focus();
}

async function copyDownloadLink() {
  const url = $("#download-url").value;
  try {
    await navigator.clipboard.writeText(url);
    toast(t("toast.copied"));
  } catch {
    const input = $("#download-url");
    input.focus();
    input.select();
    toast(t("toast.copyManual"));
  }
  state.awayForFile = true;
}

/** Desktop Chrome/Edge can open the picker straight in Downloads. */
async function chooseFile(e) {
  // Native <input> handles it: phones, other browsers, and our own fallback click.
  if (!window.showOpenFilePicker || document.body.classList.contains("phone") || e.target === $("#file-input")) return;
  e.preventDefault();
  try {
    const handles = await window.showOpenFilePicker({
      startIn: "downloads",
      multiple: true,
      types: [{ description: t("picker.desc"), accept: { "application/octet-stream": [".fit", ".gpx", ".tcx", ".gz"] } }],
    });
    handleFiles(await Promise.all(handles.map((h) => h.getFile())));
  } catch (err) {
    if (err.name !== "AbortError") $("#file-input").click();
  }
}

/** Coming back from Strava: point at step 2. */
function onReturn() {
  if (document.visibilityState !== "visible" || !state.awayForFile) return;
  state.awayForFile = false;
  if (location.hash && location.hash !== "#/") return;
  $("#step-file").classList.add("attention");
  $("#step-file").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleFiles(files) {
  files = [...files].filter(Boolean);
  if (!files.length) return;
  const status = $("#add-status");
  status.classList.remove("error");
  let lastId = null, added = 0;
  const errors = [];
  for (const [i, file] of files.entries()) {
    status.textContent = files.length > 1
      ? t("status.readingN", { i: i + 1, n: files.length, name: file.name })
      : t("status.reading", { name: file.name });
    status.hidden = false;
    try {
      const act = await readActivityFile(file);
      const stravaId = files.length === 1 ? state.pendingStravaId : null;
      const summary = await saveActivity(act, stravaId);
      lastId = summary.id;
      added++;
    } catch (e) {
      console.error(e);
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  $("#file-input").value = "";
  if (resolve()) await reanalyzeAll();
  status.hidden = !errors.length;
  status.textContent = errors.join("\n");
  status.classList.toggle("error", !!errors.length);
  if (added) {
    $("#step-file").classList.remove("attention");
    $("#strava-link").value = "";
    setStravaLink("");
  }
  if (added === 1) go(`#/a/${encodeURIComponent(lastId)}`);
  else if (added > 1) { toast(t("toast.added", { n: added })); go("#/"); }
}

function activityId(act) {
  return `${act.start}-${act.sport}`;
}

async function saveActivity(act, stravaId) {
  const id = activityId(act);
  const existing = state.summaries.find((s) => s.id === id);
  const an = analyze(act, state.settings);
  const summary = {
    id,
    strava_id: stravaId || existing?.strava_id || null,
    name: act.name || existing?.name || `${sportLabel(act.sport)} ${new Date(act.start * 1000).toLocaleDateString(locale())}`,
    sport_type: act.sport,
    start_date: new Date(act.start * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    start_date_local: localIso(act),
    device: act.device,
    source: act.source,
    has_gps: !!act.lat,
    added_at: Date.now(),
    ...summaryFields(act, an),
  };
  await store.save(summary, act);
  state.summaries = sortByDate([...state.summaries.filter((s) => s.id !== id), summary]);
  return summary;
}

/** Fields that depend on analysis (and so on settings). */
function summaryFields(act, an) {
  const s = an.summary;
  return {
    distance: s.distance,
    moving_time: Math.round(s.movingTime),
    elapsed_time: Math.round(s.elapsedTime),
    total_elevation_gain: s.elevGain,
    average_speed: s.avgSpeed,
    gap_speed: s.avgGapSpeed,
    max_speed: s.maxSpeed,
    average_heartrate: s.avgHr,
    max_heartrate: s.maxHr,
    average_cadence: s.avgCad,
    average_watts: s.avgPower,
    weighted_average_watts: s.np,
    device_watts: !!act.power,
    load: s.load,
    load_method: s.loadMethod,
    decoupling: s.decoupling,
    best20_speed: isRun(act.sport) ? s.best20Speed : null,
    best_efforts: Object.fromEntries(an.bestEfforts.map((b) => [b.name, b.sec])),
  };
}

// ================= home =================

function renderHome() {
  const list = $("#activity-list");
  const items = [...state.summaries].reverse();
  $("#history-empty").hidden = items.length > 0;
  $("#history-head").hidden = items.length === 0;
  list.innerHTML = items.map((s) => {
    const foot = isFoot(s.sport_type);
    const speed = s.average_speed && s.distance > 100 ? (foot ? `${fmtPace(1000 / s.average_speed)} /km` : `${num(s.average_speed * 3.6, 1)} km/h`) : "";
    return `<li><a href="#/a/${encodeURIComponent(s.id)}" class="act-row">
      <span class="act-main"><b>${esc(s.name)}</b><span class="muted">${esc(fmtDate(s.start_date_local))} · ${esc(sportLabel(s.sport_type))}</span></span>
      <span class="act-nums">${s.distance > 100 ? `<span>${num(s.distance / 1000, 2)} km</span>` : ""}
        <span>${fmtClock(s.moving_time)}</span>${speed ? `<span class="muted">${speed}</span>` : ""}</span>
    </a></li>`;
  }).join("");
}

// ================= activity view =================

async function openActivity(id) {
  show("activity");
  $("#act-body").hidden = true;
  $("#act-loading").hidden = false;
  const [summary, rec] = await Promise.all([store.getSummary(id), store.getStreams(id)]).catch(() => []);
  $("#act-loading").hidden = true;
  if (!summary || !rec) {
    $("#act-title").textContent = t("act.notFound");
    $("#act-sub").textContent = t("act.notFoundSub");
    return;
  }
  const an = analyze(rec.act, state.settings);
  state.current = { summary, act: rec.act, an };
  renderActivity();
}

function openDemo() {
  show("activity");
  $("#act-loading").hidden = true;
  const act = demoActivity();
  // Demo history so comparisons and PR ranks have something to compare with.
  const history = demoHistory();
  const { settings } = resolveSettings(history, {});
  const an = analyze(act, settings);
  state.current = {
    summary: { id: "demo", name: t("demo.name"), sport_type: act.sport, start_date_local: localIso(act), device: act.device },
    act, an, demoHistory: history, demoSettings: settings,
  };
  renderActivity();
}

function renderActivity() {
  const { summary, act, an, demoHistory: dh } = state.current;
  const s = an.summary;
  const settings = state.current.demoSettings || state.settings;
  const history = dh || state.summaries;
  const foot = isFoot(act.sport);
  const hasDist = s.distance > 100;
  $("#act-body").hidden = false;

  $("#act-title").textContent = summary.name;
  $("#act-sub").textContent = [fmtDateTime(summary.start_date_local), sportLabel(act.sport), act.device].filter(Boolean).join(" · ");
  const strava = $("#act-strava");
  strava.hidden = !summary.strava_id;
  if (summary.strava_id) strava.href = `https://www.strava.com/activities/${summary.strava_id}`;
  $("#act-delete").hidden = state.demo;
  $("#demo-banner").hidden = !state.demo;

  // ---- tiles ----
  const tiles = [];
  const bpm = t("unit.bpm");
  if (hasDist) tiles.push([t("tile.distance"), num(s.distance / 1000, 2), "km"]);
  tiles.push([t("tile.moving"), fmtClock(s.movingTime), ""]);
  if (hasDist && foot) tiles.push([t("tile.pace"), fmtPace(1000 / s.avgSpeed), "/km"]);
  if (hasDist && foot && s.elevGain != null) tiles.push([t("tile.gap"), fmtPace(1000 / s.avgGapSpeed), "/km"]);
  if (hasDist && !foot) tiles.push([t("tile.speed"), num(s.avgSpeed * 3.6, 1), "km/h"]);
  if (s.elevGain != null) tiles.push([t("tile.elev"), Math.round(s.elevGain), "m"]);
  if (s.avgHr) tiles.push([t("tile.avgHr"), Math.round(s.avgHr), bpm]);
  if (s.maxHr) tiles.push([t("tile.maxHr"), Math.round(s.maxHr), bpm]);
  if (s.avgPower) tiles.push([t("tile.power"), Math.round(s.avgPower), "W"]);
  if (s.np) tiles.push([t("tile.np"), Math.round(s.np), "W"]);
  if (s.avgCad) tiles.push([t("tile.cadence"), Math.round(s.avgCad), foot ? t("unit.spm") : t("unit.rpm")]);
  tiles.push([t("tile.load"), Math.round(s.load), s.loadMethod === "est" ? t("tile.est") : ""]);
  tiles.push([t("tile.elapsed"), fmtClock(s.elapsedTime), ""]);
  if (s.avgTemp != null) tiles.push([t("tile.temp"), Math.round(s.avgTemp), "°C"]);
  $("#act-tiles").innerHTML = tiles.map(([l, v, u]) =>
    `<div class="tile"><span class="tile-label">${l}</span><span class="tile-value">${esc(v)}<small>${u ? " " + u : ""}</small></span></div>`
  ).join("");

  // ---- insights ----
  $("#act-insights").innerHTML = insights(an, act, history, settings).map((x) => `<li>${x}</li>`).join("");

  // ---- map ----
  $("#map-card").hidden = !an.track;
  if (an.track) {
    if ((state.mapMode === "hr" && !act.hr) || (state.mapMode === "grade" && !act.alt)) state.mapMode = "speed";
    $$("#map-mode button").forEach((b) => {
      b.hidden = (b.dataset.mode === "hr" && !act.hr) || (b.dataset.mode === "grade" && !act.alt);
      if (b.dataset.mode === "speed") b.textContent = foot ? t("map.pace") : t("map.speed");
      b.setAttribute("aria-pressed", String(b.dataset.mode === state.mapMode));
    });
    renderMap();
  }

  // ---- charts ----
  const ser = an.series;
  const pace = ser.speed.map((v) => (v > 0.8 ? 1000 / v : null));
  const gap = ser.gapSpeed.map((v) => (v > 0.8 ? 1000 / v : null));
  const kmh = ser.speed.map((v) => (v != null ? v * 3.6 : null));
  const chartSeries = { ...ser, pace, gap, kmh };
  const pct = (arr, p) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v[Math.floor((v.length - 1) * p)]; };
  const defs = [];
  if (hasDist && foot) {
    defs.push({ key: "pace", label: t("chart.pace"), unit: "/km", color: seriesColor(0), fmt: fmtPace, reverse: true, min: pct(pace, 0.01), max: pct(pace, 0.99) + 15 });
    if (act.alt) defs.push({ key: "gap", label: t("chart.gap"), unit: "/km", color: seriesColor(6), fmt: fmtPace, reverse: true, min: pct(gap, 0.01), max: pct(gap, 0.99) + 15 });
  } else if (hasDist) {
    defs.push({ key: "kmh", label: t("chart.speed"), unit: "km/h", color: seriesColor(0), fmt: (v) => num(v, 0), min: 0 });
  }
  if (act.hr) defs.push({ key: "hr", label: t("chart.hr"), unit: t("unit.bpm"), color: seriesColor(7), fmt: (v) => Math.round(v) });
  if (ser.alt) defs.push({ key: "alt", label: t("chart.elev"), unit: "m", color: css("--text-muted"), fmt: (v) => Math.round(v), fill: true });
  if (act.cad) defs.push({ key: "cad", label: t("chart.cad"), unit: foot ? t("unit.spm") : t("unit.rpm"), color: seriesColor(2), fmt: (v) => Math.round(v) });
  if (act.power) defs.push({ key: "power", label: t("chart.power"), unit: "W", color: seriesColor(1), fmt: (v) => Math.round(v), min: 0 });
  $("#act-charts").innerHTML = defs.map((d, i) =>
    `<div class="stream"><div class="stream-head"><h3><span class="swatch" style="background:${d.color}"></span>${d.label}</h3><span class="readout" id="ro-${i}"></span></div>
     <div class="chart stream-chart"><canvas id="sc-${i}" role="img" aria-label="${esc(t("chart.aria", { label: d.label }))}"></canvas></div></div>`
  ).join("");
  defs.forEach((d, i) => (d.id = `sc-${i}`));
  const xLabel = $("#readout-x");
  const onHover = (x) => {
    mapHover(x != null && ser.xKind === "km" ? x : null);
    if (x == null) {
      xLabel.textContent = t("chart.hoverHint");
      defs.forEach((_, i) => ($(`#ro-${i}`).textContent = ""));
      return;
    }
    const idx = nearestIndex(ser.x, x);
    xLabel.textContent = ser.xKind === "km" ? t("chart.atKm", { x: num(x, 2) }) : t("chart.atTime", { x: fmtClock(x * 60) });
    defs.forEach((d, i) => {
      const v = chartSeries[d.key][idx];
      $(`#ro-${i}`).textContent = v == null ? "–" : `${d.fmt(v)} ${d.unit}`;
    });
  };
  drawStreams(defs, chartSeries, onHover);
  onHover(null);

  // ---- splits ----
  $("#splits-card").hidden = !an.splits.length;
  if (an.splits.length) renderSplits(an, foot);

  // ---- zones ----
  const est = (k) => state.estimated[k] && !state.demo ? t("zones.est") : "";
  const zoneBlocks = [];
  if (an.zones.hr) zoneBlocks.push(["hr", t("zones.hr"), an.zones.hr, (z) => z.hi ? `${z.lo}–${z.hi} ${bpm}` : `> ${z.lo} ${bpm}`,
    t("zones.hrNote", { v: settings.maxHr, est: est("maxHr") })]);
  if (an.zones.pace) zoneBlocks.push(["pace", t("zones.pace"), an.zones.pace, (z) =>
    z.fast && z.slow ? `${fmtPace(z.fast)}–${fmtPace(z.slow)} /km` : z.slow ? t("zones.slower", { p: fmtPace(z.slow) }) : t("zones.faster", { p: fmtPace(z.fast) }),
    t("zones.paceNote", { v: fmtPace(settings.thresholdPace), est: est("thresholdPace") })]);
  if (an.zones.power) zoneBlocks.push(["power", t("zones.power"), an.zones.power, (z) => z.hi ? `${z.lo}–${z.hi} W` : `> ${z.lo} W`, t("zones.powerNote", { v: settings.ftp })]);
  $("#zones-card").hidden = !zoneBlocks.length;
  $("#act-zones").innerHTML = zoneBlocks.map(([kind, title, zones, range, note]) => zoneHtml(kind, title, zones, range, note)).join("");

  // ---- best efforts ----
  $("#efforts-card").hidden = !an.bestEfforts.length;
  if (an.bestEfforts.length) renderBestEfforts(an, act, history, summary.id);

  // ---- power curve ----
  $("#power-card").hidden = !an.powerCurve?.length;
  if (an.powerCurve?.length) drawPowerCurve("chart-power-curve", an.powerCurve);
}

function renderMap() {
  const { an, act } = state.current;
  const info = drawMap($("#map"), an.track, state.mapMode);
  if (!info) return;
  const fmt = state.mapMode === "hr" ? (v) => `${Math.round(v)} ${t("unit.bpm")}`
    : state.mapMode === "grade" ? (v) => fmtPct(v * 100)
    : isFoot(act.sport) ? (v) => `${fmtPace(1000 / v)} /km` : (v) => `${num(v * 3.6, 0)} km/h`;
  const [lowLabel, highLabel] = state.mapMode === "speed" ? [t("map.slower"), t("map.faster")] : [t("map.low"), t("map.high")];
  $("#map-legend").innerHTML = `<span>${lowLabel}<br>${fmt(info.lo)}</span>
    <span class="ramp" style="background:linear-gradient(90deg,${info.ramp.join(",")})"></span>
    <span>${highLabel}<br>${fmt(info.hi)}</span>`;
}

function insights(an, act, history, settings) {
  const s = an.summary, out = [];
  const same = history.filter((h) => sportOf(h) === act.sport && h.id !== state.current.summary.id);
  if (same.length >= 4) {
    const loads = same.map((h) => activityLoad(h, settings).load);
    const pct = Math.round((loads.filter((l) => l < s.load).length / loads.length) * 100);
    const name = sportLabel(act.sport);
    const sport = esc(getLang() === "en" ? name.toLowerCase() : name);
    out.push(pct >= 50
      ? t("ins.loadVs.harder", { l: Math.round(s.load), p: pct, sport })
      : t("ins.loadVs.easier", { l: Math.round(s.load), p: 100 - pct, sport }));
  } else {
    out.push(t("ins.load", { l: Math.round(s.load), method: t(`ins.method.${s.loadMethod}`) }));
  }
  if (an.zones.hr) {
    const total = an.zones.hr.reduce((a, z) => a + z.sec, 0);
    const topIdx = an.zones.hr.reduce((best, z, i, arr) => (z.sec > arr[best].sec ? i : best), 0);
    const top = an.zones.hr[topIdx];
    if (total) out.push(t("ins.zone", { zone: esc(t("zone.hr")[topIdx]), p: Math.round((top.sec / total) * 100) }));
  }
  if (s.decoupling != null) {
    const d = s.decoupling;
    out.push(t(d > 5 ? "ins.driftHigh" : "ins.driftLow", { d: num(d, 1) }));
  }
  if (s.pauses.length) {
    out.push(t("ins.stops", { n: s.pauses.length, t: fmtMinSec(s.stoppedTime) }));
  }
  const splits = an.splits.filter((x) => x.dist >= 999 && x.gapPace);
  if (splits.length >= 4 && isFoot(act.sport)) {
    const half = Math.floor(splits.length / 2);
    const avg = (a) => a.reduce((x, y) => x + y.gapPace, 0) / a.length;
    const diff = avg(splits.slice(half)) - avg(splits.slice(0, half));
    out.push(Math.abs(diff) < 5 ? t("ins.even")
      : diff < 0 ? t("ins.negative", { s: Math.round(-diff) })
      : t("ins.positive", { s: Math.round(diff) }));
  }
  return out;
}

function renderSplits(an, foot) {
  const paces = an.splits.map((x) => x.pace).filter(Boolean);
  const fastest = Math.min(...paces), slowest = Math.max(...paces);
  $("#splits-head").innerHTML = `<tr><th>${t("splits.km")}</th><th>${foot ? t("splits.pace") : t("splits.speed")}</th>${foot ? `<th class="num">${t("splits.gap")}</th>` : ""}<th class="num">${t("splits.hr")}</th><th class="num">${t("splits.elev")}</th></tr>`;
  $("#splits-rows").innerHTML = an.splits.map((x) => {
    const w = slowest > fastest ? 35 + 65 * ((slowest - x.pace) / (slowest - fastest)) : 100;
    const km = x.dist >= 999 ? x.n : num(x.dist / 1000, 2);
    const main = foot ? fmtPace(x.pace) : num(3600 / x.pace, 1);
    return `<tr>
      <td>${km}</td>
      <td class="bar-cell"><span class="bar" style="width:${w.toFixed(0)}%"></span><span class="bar-label">${main}</span></td>
      ${foot ? `<td class="num">${x.gapPace ? fmtPace(x.gapPace) : "–"}</td>` : ""}
      <td class="num">${x.hr ? Math.round(x.hr) : "–"}</td>
      <td class="num">${x.elev != null ? (x.elev > 0 ? "+" : "") + Math.round(x.elev) : "–"}</td>
    </tr>`;
  }).join("");
}

function zoneHtml(kind, title, zones, range, note) {
  const names = t(`zone.${kind}`);
  const total = zones.reduce((a, z) => a + z.sec, 0) || 1;
  const ramp = zones.length <= 5 ? [0, 1, 2, 3, 5].map((i) => ZONE_RAMP[i]) : ZONE_RAMP;
  return `<div class="zone-block"><h3>${title}</h3><ul class="zones">${zones.map((z, i) => {
    const pct = (z.sec / total) * 100;
    return `<li><span class="zone-name">${esc(names[i] || z.name)}<span class="muted">${esc(range(z))}</span></span>
      <span class="zone-bar"><span style="width:${pct.toFixed(1)}%;background:${ramp[i]}"></span></span>
      <span class="zone-val">${fmtClock(z.sec)}<span class="muted">${fmtPct(pct)}</span></span></li>`;
  }).join("")}</ul><p class="muted small">${note}</p></div>`;
}

function renderBestEfforts(an, act, history, selfId) {
  const others = history.filter((h) => h.id !== selfId && isRun(sportOf(h)) === isRun(act.sport) && h.best_efforts);
  $("#efforts-rows").innerHTML = an.bestEfforts.map((b) => {
    const prev = others.map((h) => h.best_efforts[b.name]).filter((x) => x != null);
    const rank = prev.filter((x) => x < b.sec).length + 1;
    const badge = !prev.length ? "" : rank === 1 ? `<span class="badge gold">${t("effort.best")}</span>` : rank <= 3 ? `<span class="badge">${t(rank === 2 ? "effort.2nd" : "effort.3rd")}</span>` : "";
    return `<tr><td>${esc(t("effort.names")[b.name] || b.name)}</td><td class="num">${fmtClock(b.sec)}</td><td class="num">${fmtPace(b.sec / (b.dist / 1000))} /km</td><td>${badge}</td></tr>`;
  }).join("");
  $("#efforts-note").textContent = others.length
    ? t(isRun(act.sport) ? "effort.noteRuns" : "effort.noteOther", { n: others.length })
    : t("effort.empty");
}

async function deleteCurrent() {
  const { summary } = state.current;
  if (!confirm(t("act.confirmDelete", { name: summary.name }))) return;
  await store.remove(summary.id);
  state.summaries = state.summaries.filter((s) => s.id !== summary.id);
  if (resolve()) await reanalyzeAll();
  go("#/");
}

function exportSplits() {
  const { an, summary } = state.current;
  download(`${fileSafe(summary.name)}-splits.csv`, toCsv(an.splits, [
    ["split", (x) => x.n], ["distance_m", (x) => Math.round(x.dist)], ["time_s", (x) => Math.round(x.time)],
    ["pace_per_km", (x) => fmtPace(x.pace)], ["gap_per_km", (x) => fmtPace(x.gapPace)],
    ["avg_hr", (x) => (x.hr ? Math.round(x.hr) : "")], ["elev_change_m", (x) => (x.elev != null ? x.elev.toFixed(1) : "")],
  ]), "text/csv");
}

function exportPoints() {
  const { act, summary } = state.current;
  const rows = act.t.map((_, i) => i);
  const col = (arr, d = 1) => (i) => (arr && arr[i] != null ? +arr[i].toFixed(d) : "");
  download(`${fileSafe(summary.name)}-data.csv`, toCsv(rows, [
    ["time_s", (i) => act.t[i]], ["distance_m", col(act.dist)], ["lat", col(act.lat, 6)], ["lon", col(act.lon, 6)],
    ["altitude_m", col(act.alt)], ["heart_rate", col(act.hr, 0)], ["cadence", col(act.cad, 0)],
    ["power_w", col(act.power, 0)], ["temp_c", col(act.temp)], ["timer_on", (i) => act.timerOn[i]],
  ]), "text/csv");
}

// ================= fitness =================

function today() {
  const d = new Date();
  return fmtDay(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function renderFitness() {
  const list = state.summaries;
  const empty = list.length === 0;
  $("#fitness-empty").hidden = !empty;
  $("#fitness-body").hidden = empty;
  if (empty) return;
  const loads = list.map((a) => ({ day: dayOf(a), load: activityLoad(a, state.settings).load }));
  const f = fitnessSeries(loads, today());
  const now = f.at(-1), weekAgo = f.at(-8) || f[0];
  const delta = Math.round(now.ctl - weekAgo.ctl);
  $("#stat-fitness").textContent = Math.round(now.ctl);
  $("#stat-fitness-sub").textContent = t("fit.delta", { d: `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}` });
  $("#stat-fatigue").textContent = Math.round(now.atl);
  $("#stat-form").textContent = Math.round(now.ctl - now.atl);
  $("#stat-form-sub").textContent = formLabel(now.ctl - now.atl);
  const shown = state.fitnessRange ? f.slice(-state.fitnessRange) : f;
  drawFitness("chart-fitness", shown);
  drawForm("chart-form", shown);
  drawWeeklyLoad("chart-weekly-load", weeklyLoad(loads, today(), 12));
  const first = list[0], last = list.at(-1);
  $("#fitness-coverage").textContent = t("fit.coverage", {
    n: list.length, from: fmtDate(first.start_date_local), to: fmtDate(last.start_date_local),
  });
}

function formLabel(tsb) {
  if (tsb > 15) return t("form.fresh2");
  if (tsb > 5) return t("form.fresh");
  if (tsb > -10) return t("form.neutral");
  if (tsb > -30) return t("form.productive");
  return t("form.tired");
}

// ================= trends =================

function renderTrends() {
  const list = state.summaries;
  $("#trends-empty").hidden = list.length > 0;
  $("#trends-body").hidden = list.length === 0;
  if (!list.length) return;
  const { period, metric } = state.volume;
  const time = new Map();
  for (const a of list) time.set(sportOf(a), (time.get(sportOf(a)) || 0) + (a.moving_time || 0));
  const ranked = [...time].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const top = ranked.slice(0, ranked.length > 7 ? 6 : 7);
  const group = (s) => (top.includes(s) ? s : "Other");
  const colors = { Other: css("--other") };
  top.forEach((s, i) => (colors[s] = seriesColor(i)));

  const sel = $("#vol-sport");
  const opts = ["all", ...top, ...(ranked.length > top.length ? ["Other"] : [])];
  if (sel.dataset.sig !== opts.join()) {
    sel.innerHTML = opts.map((s) => `<option value="${esc(s)}">${s === "all" ? t("tr.allSports") : esc(sportLabel(s))}</option>`).join("");
    sel.dataset.sig = opts.join();
    if (!opts.includes(state.volume.sport)) state.volume.sport = "all";
    sel.value = state.volume.sport;
  }
  const span = { week: 26 * 7, month: 730, year: null }[period];
  const from = span ? addDays(today(), -span) : null;
  let acts = list.map((a) => ({ ...a, sport_type: group(sportOf(a)) }));
  if (state.volume.sport !== "all") acts = acts.filter((a) => a.sport_type === state.volume.sport);
  const vol = volumeByPeriod(acts, { period, metric, from, to: today() });
  const unit = { distance: "km", time: "h", elevation: "m", count: "" }[metric];
  const labelFor = (k, long = false) =>
    period === "year" ? k
    : period === "month" ? new Date(k + "-01T00:00:00Z").toLocaleDateString(locale(), { month: "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" })
    : long ? t("chart.weekOf", { d: new Date(k + "T00:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) })
    : new Date(k + "T00:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", timeZone: "UTC" });
  drawVolume("chart-volume", vol, { unit, labelFor, sportColors: colors, sportLabel });
  const digits = metric === "count" || metric === "elevation" ? 0 : 1;
  $("#volume-totals").innerHTML = vol.sports.map((s) => {
    const v = vol.values[s].reduce((x, y) => x + y, 0);
    return `<li><span class="swatch" style="background:${colors[s]}"></span>${esc(sportLabel(s))}<b>${num(v, digits)} ${unit}</b></li>`;
  }).join("");
}

// ================= export all / delete all =================

function exportAllCsv() {
  const r1 = (x) => (x == null ? "" : Math.round(x * 10) / 10);
  download(`activities-${today()}.csv`, toCsv(state.summaries, [
    ["date_local", (a) => (a.start_date_local || "").replace("Z", "").replace("T", " ")],
    ["name", (a) => a.name], ["sport", (a) => sportOf(a)],
    ["distance_km", (a) => r1((a.distance || 0) / 1000)], ["moving_time_min", (a) => r1(a.moving_time / 60)],
    ["elapsed_time_min", (a) => r1(a.elapsed_time / 60)], ["elevation_gain_m", (a) => r1(a.total_elevation_gain)],
    ["avg_pace_per_km", (a) => (isFoot(sportOf(a)) && a.average_speed ? fmtPace(1000 / a.average_speed) : "")],
    ["gap_per_km", (a) => (isFoot(sportOf(a)) && a.gap_speed ? fmtPace(1000 / a.gap_speed) : "")],
    ["avg_speed_kmh", (a) => (a.average_speed ? r1(a.average_speed * 3.6) : "")],
    ["avg_hr", (a) => r1(a.average_heartrate)], ["max_hr", (a) => r1(a.max_heartrate)],
    ["avg_cadence", (a) => r1(a.average_cadence)], ["avg_power_w", (a) => r1(a.average_watts)],
    ["normalized_power_w", (a) => r1(a.weighted_average_watts)], ["training_load", (a) => r1(a.load)],
    ["load_method", (a) => a.load_method], ["hr_drift_pct", (a) => r1(a.decoupling)],
    ["strava_id", (a) => a.strava_id], ["device", (a) => a.device],
  ]), "text/csv");
}

function exportAllJson() {
  download(`activities-${today()}.json`, JSON.stringify(state.summaries, null, 2), "application/json");
}

async function deleteAll() {
  if (!confirm(t("set.confirmDeleteAll"))) return;
  await store.clear();
  try { localStorage.removeItem(SETTINGS_KEY); } catch { /* ignore */ }
  location.hash = "#/";
  location.reload();
}

// ================= handlers =================

function wireHandlers() {
  setDeviceMode(detectPhone());
  $$(".lang-switch button").forEach((b) => b.addEventListener("click", () => switchLanguage(b.dataset.lang)));
  $("#switch-device").addEventListener("click", () => setDeviceMode(!document.body.classList.contains("phone"), true));
  $("#strava-link").addEventListener("input", (e) => setStravaLink(e.target.value));
  $("#paste-link").addEventListener("click", pasteLink);
  $("#copy-download").addEventListener("click", copyDownloadLink);
  $("#download-url").addEventListener("focus", (e) => e.target.select());
  $$("[data-strava-open]").forEach((a) => a.addEventListener("click", () => (state.awayForFile = true)));
  $("#strava-download").addEventListener("click", () => (state.awayForFile = true));
  document.addEventListener("visibilitychange", onReturn);
  $("#dropzone").addEventListener("click", chooseFile);
  $("#file-input").addEventListener("change", (e) => handleFiles(e.target.files));
  const drop = $("#dropzone");
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  // Dropping a file anywhere on the page adds it instead of navigating away.
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files); });

  $("#open-settings").addEventListener("click", openSettings);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#settings-cancel").addEventListener("click", () => $("#settings").close());
  $("#set-pace").addEventListener("input", (e) => e.target.setCustomValidity(""));
  $("#export-all-csv").addEventListener("click", exportAllCsv);
  $("#export-all-json").addEventListener("click", exportAllJson);
  $("#delete-all").addEventListener("click", deleteAll);

  $("#act-delete").addEventListener("click", deleteCurrent);
  $("#export-splits").addEventListener("click", exportSplits);
  $("#export-points").addEventListener("click", exportPoints);
  $$("#map-mode button").forEach((b) => b.addEventListener("click", () => {
    state.mapMode = b.dataset.mode;
    $$("#map-mode button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderMap();
  }));
  $$("#fitness-range button").forEach((b) => b.addEventListener("click", () => {
    state.fitnessRange = Number(b.dataset.days) || 0;
    $$("#fitness-range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderFitness();
  }));
  for (const [id, key] of [["#vol-period", "period"], ["#vol-metric", "metric"], ["#vol-sport", "sport"]]) {
    $(id).addEventListener("change", (e) => { state.volume[key] = e.target.value; renderTrends(); });
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", route);
}

// ================= formatting =================

function sortByDate(list) {
  return list.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
}
function sportLabel(s) {
  return sportName(s);
}
function fmtClock(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
/** "84 %" in Czech, "84%" in English. */
function fmtPct(v) {
  return `${Math.round(v)}${getLang() === "cs" ? "\u00a0%" : "%"}`;
}
function fmtMinSec(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m >= 60 ? fmtDuration(sec) : m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}
function fmtDate(local) {
  return new Date(local).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function fmtDateTime(local) {
  return new Date(local).toLocaleString(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
function nearestIndex(xs, x) {
  let lo = 0, hi = xs.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; }
  return lo > 0 && Math.abs(xs[lo - 1] - x) < Math.abs(xs[lo] - x) ? lo - 1 : lo;
}
function fileSafe(s) {
  return (s || "activity").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "activity";
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer = 0;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

boot();
