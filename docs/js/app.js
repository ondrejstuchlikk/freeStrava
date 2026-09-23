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

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const SETTINGS_KEY = "freestrava.settings";
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
};

// ================= boot & routing =================

async function boot() {
  wireHandlers();
  state.userSettings = loadUserSettings();
  try {
    state.summaries = sortByDate(await store.allSummaries());
  } catch {
    toast("Your browser blocked local storage (private mode?). Activities won’t be saved.");
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
  $("#set-maxhr").placeholder = `${r.maxHr}${state.estimated.maxHr ? " (estimate)" : ""}`;
  $("#set-resthr").value = u.restHr || "";
  $("#set-resthr").placeholder = String(r.restHr);
  $("#set-sex").value = String(r.trimpK);
  $("#set-pace").value = u.thresholdPace ? fmtPace(u.thresholdPace) : "";
  $("#set-pace").placeholder = `${fmtPace(r.thresholdPace)}${state.estimated.thresholdPace ? " (estimate)" : ""}`;
  $("#set-ftp").value = u.ftp || "";
  $("#settings").showModal();
}

async function saveSettings(e) {
  e.preventDefault();
  const num = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) && v > 0 ? v : null; };
  const paceStr = $("#set-pace").value.trim();
  const pace = parsePace(paceStr);
  if (paceStr && !pace) {
    $("#set-pace").setCustomValidity("Use minutes:seconds, e.g. 4:45");
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
    toast("Recalculating your activities…");
    await reanalyzeAll();
    toast("Updated.");
  }
  route();
}

// ================= adding files =================

function onStravaLinkInput() {
  const v = $("#strava-link").value.trim();
  const m = /strava\.com\/activities\/(\d+)/.exec(v);
  const hint = $("#link-hint");
  const btn = $("#strava-download"), gpx = $("#strava-gpx");
  if (m) {
    state.pendingStravaId = m[1];
    btn.href = `https://www.strava.com/activities/${m[1]}/export_original`;
    gpx.href = `https://www.strava.com/activities/${m[1]}/export_gpx`;
    btn.removeAttribute("aria-disabled");
    gpx.hidden = false;
    hint.textContent = "Tap the button and the file downloads from Strava. Then do step 2.";
  } else {
    state.pendingStravaId = null;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    gpx.hidden = true;
    hint.textContent = !v ? "" : /strava\.app\.link|strava\.com\/share/.test(v)
      ? "That’s a share link from the Strava app. Open it in your browser (not the app), then copy the address that starts with strava.com/activities/…"
      : "That doesn’t look like a Strava activity link (…strava.com/activities/123456789).";
  }
}

async function handleFiles(files) {
  files = [...files].filter(Boolean);
  if (!files.length) return;
  const status = $("#add-status");
  status.classList.remove("error");
  let lastId = null, added = 0;
  const errors = [];
  for (const [i, file] of files.entries()) {
    status.textContent = files.length > 1 ? `Reading ${i + 1} of ${files.length}: ${file.name}…` : `Reading ${file.name}…`;
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
  if (added === 1) go(`#/a/${encodeURIComponent(lastId)}`);
  else if (added > 1) { toast(`Added ${added} activities.`); go("#/"); }
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
    name: act.name || existing?.name || `${sportLabel(act.sport)} ${new Date(act.start * 1000).toLocaleDateString()}`,
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
  state.pendingStravaId = null;
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
    const speed = s.average_speed && s.distance > 100 ? (foot ? `${fmtPace(1000 / s.average_speed)} /km` : `${(s.average_speed * 3.6).toFixed(1)} km/h`) : "";
    return `<li><a href="#/a/${encodeURIComponent(s.id)}" class="act-row">
      <span class="act-main"><b>${esc(s.name)}</b><span class="muted">${esc(fmtDate(s.start_date_local))} · ${esc(sportLabel(s.sport_type))}</span></span>
      <span class="act-nums">${s.distance > 100 ? `<span>${(s.distance / 1000).toFixed(2)} km</span>` : ""}
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
    $("#act-title").textContent = "Activity not found";
    $("#act-sub").textContent = "It may have been deleted, or it was added in a different browser.";
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
    summary: { id: "demo", name: act.name, sport_type: act.sport, start_date_local: localIso(act), device: act.device },
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
  if (hasDist) tiles.push(["Distance", (s.distance / 1000).toFixed(2), "km"]);
  tiles.push(["Moving time", fmtClock(s.movingTime), ""]);
  if (hasDist && foot) tiles.push(["Avg pace", fmtPace(1000 / s.avgSpeed), "/km"]);
  if (hasDist && foot && s.elevGain != null) tiles.push(["Grade-adj. pace", fmtPace(1000 / s.avgGapSpeed), "/km"]);
  if (hasDist && !foot) tiles.push(["Avg speed", (s.avgSpeed * 3.6).toFixed(1), "km/h"]);
  if (s.elevGain != null) tiles.push(["Elevation gain", Math.round(s.elevGain), "m"]);
  if (s.avgHr) tiles.push(["Avg heart rate", Math.round(s.avgHr), "bpm"]);
  if (s.maxHr) tiles.push(["Max heart rate", Math.round(s.maxHr), "bpm"]);
  if (s.avgPower) tiles.push(["Avg power", Math.round(s.avgPower), "W"]);
  if (s.np) tiles.push(["Normalized power", Math.round(s.np), "W"]);
  if (s.avgCad) tiles.push(["Cadence", Math.round(s.avgCad), foot ? "spm" : "rpm"]);
  tiles.push(["Training load", Math.round(s.load), s.loadMethod === "est" ? "est." : ""]);
  tiles.push(["Elapsed time", fmtClock(s.elapsedTime), ""]);
  if (s.avgTemp != null) tiles.push(["Temperature", Math.round(s.avgTemp), "°C"]);
  $("#act-tiles").innerHTML = tiles.map(([l, v, u]) =>
    `<div class="tile"><span class="tile-label">${l}</span><span class="tile-value">${esc(v)}<small>${u ? " " + u : ""}</small></span></div>`
  ).join("");

  // ---- insights ----
  $("#act-insights").innerHTML = insights(an, act, history, settings).map((t) => `<li>${t}</li>`).join("");

  // ---- map ----
  $("#map-card").hidden = !an.track;
  if (an.track) {
    if ((state.mapMode === "hr" && !act.hr) || (state.mapMode === "grade" && !act.alt)) state.mapMode = "speed";
    $$("#map-mode button").forEach((b) => {
      b.hidden = (b.dataset.mode === "hr" && !act.hr) || (b.dataset.mode === "grade" && !act.alt);
      b.textContent = b.dataset.mode === "speed" ? (foot ? "Pace" : "Speed") : b.textContent;
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
    defs.push({ key: "pace", label: "Pace", unit: "/km", color: seriesColor(0), fmt: fmtPace, reverse: true, min: pct(pace, 0.01), max: pct(pace, 0.99) + 15 });
    if (act.alt) defs.push({ key: "gap", label: "Grade-adjusted pace", unit: "/km", color: seriesColor(6), fmt: fmtPace, reverse: true, min: pct(gap, 0.01), max: pct(gap, 0.99) + 15 });
  } else if (hasDist) {
    defs.push({ key: "kmh", label: "Speed", unit: "km/h", color: seriesColor(0), fmt: (v) => v.toFixed(0), min: 0 });
  }
  if (act.hr) defs.push({ key: "hr", label: "Heart rate", unit: "bpm", color: seriesColor(7), fmt: (v) => Math.round(v) });
  if (ser.alt) defs.push({ key: "alt", label: "Elevation", unit: "m", color: css("--text-muted"), fmt: (v) => Math.round(v), fill: true });
  if (act.cad) defs.push({ key: "cad", label: "Cadence", unit: foot ? "spm" : "rpm", color: seriesColor(2), fmt: (v) => Math.round(v) });
  if (act.power) defs.push({ key: "power", label: "Power", unit: "W", color: seriesColor(1), fmt: (v) => Math.round(v), min: 0 });
  $("#act-charts").innerHTML = defs.map((d, i) =>
    `<div class="stream"><div class="stream-head"><h3><span class="swatch" style="background:${d.color}"></span>${d.label}</h3><span class="readout" id="ro-${i}"></span></div>
     <div class="chart stream-chart"><canvas id="sc-${i}" role="img" aria-label="${d.label} over the activity"></canvas></div></div>`
  ).join("");
  defs.forEach((d, i) => (d.id = `sc-${i}`));
  const xLabel = $("#readout-x");
  const onHover = (x) => {
    mapHover(x != null && ser.xKind === "km" ? x : null);
    if (x == null) {
      xLabel.textContent = "Touch or hover over the charts to inspect";
      defs.forEach((_, i) => ($(`#ro-${i}`).textContent = ""));
      return;
    }
    const idx = nearestIndex(ser.x, x);
    xLabel.textContent = ser.xKind === "km" ? `At ${x.toFixed(2)} km` : `At ${fmtClock(x * 60)}`;
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
  const est = (k) => state.estimated[k] && !state.demo ? " (estimated: set yours in Settings)" : "";
  const zoneBlocks = [];
  if (an.zones.hr) zoneBlocks.push(["Heart-rate zones", an.zones.hr, (z) => z.hi ? `${z.lo}–${z.hi} bpm` : `> ${z.lo} bpm`,
    `Based on max heart rate ${settings.maxHr} bpm${est("maxHr")}.`]);
  if (an.zones.pace) zoneBlocks.push(["Pace zones (grade-adjusted)", an.zones.pace, (z) =>
    z.fast && z.slow ? `${fmtPace(z.fast)}–${fmtPace(z.slow)} /km` : z.slow ? `slower than ${fmtPace(z.slow)} /km` : `faster than ${fmtPace(z.fast)} /km`,
    `Based on threshold pace ${fmtPace(settings.thresholdPace)} /km${est("thresholdPace")}.`]);
  if (an.zones.power) zoneBlocks.push(["Power zones", an.zones.power, (z) => z.hi ? `${z.lo}–${z.hi} W` : `> ${z.lo} W`, `Based on FTP ${settings.ftp} W.`]);
  $("#zones-card").hidden = !zoneBlocks.length;
  $("#act-zones").innerHTML = zoneBlocks.map(([title, zones, range, note]) => zoneHtml(title, zones, range, note)).join("");

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
  const fmt = state.mapMode === "hr" ? (v) => `${Math.round(v)} bpm`
    : state.mapMode === "grade" ? (v) => `${(v * 100).toFixed(0)}%`
    : isFoot(act.sport) ? (v) => `${fmtPace(1000 / v)} /km` : (v) => `${(v * 3.6).toFixed(0)} km/h`;
  const [lowLabel, highLabel] = state.mapMode === "speed" ? ["slower", "faster"] : ["low", "high"];
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
    const kind = `${esc(sportLabel(act.sport).toLowerCase())} activities`;
    out.push(pct >= 50
      ? `<b>Training load ${Math.round(s.load)}</b>: harder than ${pct}% of your other ${kind}.`
      : `<b>Training load ${Math.round(s.load)}</b>: easier than ${100 - pct}% of your other ${kind}.`);
  } else {
    out.push(`<b>Training load ${Math.round(s.load)}</b> (100 ≈ one hour at your threshold effort). ${loadMethodText(s.loadMethod)}`);
  }
  if (an.zones.hr) {
    const total = an.zones.hr.reduce((a, z) => a + z.sec, 0);
    const top = an.zones.hr.reduce((a, z) => (z.sec > a.sec ? z : a));
    if (total) out.push(`Most time in <b>${esc(top.name)}</b> (${Math.round((top.sec / total) * 100)}% of moving time).`);
  }
  if (s.decoupling != null) {
    const d = s.decoupling;
    out.push(d > 5
      ? `<b>Heart-rate drift ${d.toFixed(1)}%</b>: your heart rate rose relative to pace in the second half, usually from fatigue, heat or low fuel. Under 5% would suggest solid aerobic endurance for this effort.`
      : `<b>Heart-rate drift ${d.toFixed(1)}%</b>: heart rate stayed steady relative to pace, which suggests solid aerobic endurance for this effort.`);
  }
  if (s.pauses.length) {
    out.push(`${s.pauses.length} stop${s.pauses.length > 1 ? "s" : ""}, <b>${fmtMinSec(s.stoppedTime)}</b> not moving in total (left out of moving time and pace).`);
  }
  const splits = an.splits.filter((x) => x.dist >= 999 && x.gapPace);
  if (splits.length >= 4 && isFoot(act.sport)) {
    const half = Math.floor(splits.length / 2);
    const avg = (a) => a.reduce((x, y) => x + y.gapPace, 0) / a.length;
    const diff = avg(splits.slice(half)) - avg(splits.slice(0, half));
    out.push(Math.abs(diff) < 5 ? "<b>Even pacing</b>: first and second half within 5 s/km (grade-adjusted)."
      : diff < 0 ? `<b>Negative split</b>: second half ${Math.round(-diff)} s/km faster (grade-adjusted).`
      : `<b>Positive split</b>: second half ${Math.round(diff)} s/km slower (grade-adjusted).`);
  }
  return out;
}

function loadMethodText(m) {
  return {
    hr: "Calculated from your heart rate, second by second.",
    power: "Calculated from your power.",
    pace: "Estimated from your pace (no heart rate in this file).",
    est: "Rough estimate from duration only.",
  }[m] || "";
}

function renderSplits(an, foot) {
  const paces = an.splits.map((x) => x.pace).filter(Boolean);
  const fastest = Math.min(...paces), slowest = Math.max(...paces);
  $("#splits-head").innerHTML = `<tr><th>km</th><th>${foot ? "Pace /km" : "km/h"}</th>${foot ? '<th class="num">GAP</th>' : ""}<th class="num">HR</th><th class="num">Elev</th></tr>`;
  $("#splits-rows").innerHTML = an.splits.map((x) => {
    const w = slowest > fastest ? 35 + 65 * ((slowest - x.pace) / (slowest - fastest)) : 100;
    const km = x.dist >= 999 ? x.n : (x.dist / 1000).toFixed(2);
    const main = foot ? fmtPace(x.pace) : (3600 / x.pace).toFixed(1);
    return `<tr>
      <td>${km}</td>
      <td class="bar-cell"><span class="bar" style="width:${w.toFixed(0)}%"></span><span class="bar-label">${main}</span></td>
      ${foot ? `<td class="num">${x.gapPace ? fmtPace(x.gapPace) : "–"}</td>` : ""}
      <td class="num">${x.hr ? Math.round(x.hr) : "–"}</td>
      <td class="num">${x.elev != null ? (x.elev > 0 ? "+" : "") + Math.round(x.elev) : "–"}</td>
    </tr>`;
  }).join("");
}

function zoneHtml(title, zones, range, note) {
  const total = zones.reduce((a, z) => a + z.sec, 0) || 1;
  const ramp = zones.length <= 5 ? [0, 1, 2, 3, 5].map((i) => ZONE_RAMP[i]) : ZONE_RAMP;
  return `<div class="zone-block"><h3>${title}</h3><ul class="zones">${zones.map((z, i) => {
    const pct = (z.sec / total) * 100;
    return `<li><span class="zone-name">${esc(z.name)}<span class="muted">${esc(range(z))}</span></span>
      <span class="zone-bar"><span style="width:${pct.toFixed(1)}%;background:${ramp[i]}"></span></span>
      <span class="zone-val">${fmtClock(z.sec)}<span class="muted">${Math.round(pct)}%</span></span></li>`;
  }).join("")}</ul><p class="muted small">${note}</p></div>`;
}

function renderBestEfforts(an, act, history, selfId) {
  const others = history.filter((h) => h.id !== selfId && isRun(sportOf(h)) === isRun(act.sport) && h.best_efforts);
  $("#efforts-rows").innerHTML = an.bestEfforts.map((b) => {
    const prev = others.map((h) => h.best_efforts[b.name]).filter((x) => x != null);
    const rank = prev.filter((x) => x < b.sec).length + 1;
    const badge = !prev.length ? "" : rank === 1 ? '<span class="badge gold">Best</span>' : rank <= 3 ? `<span class="badge">${rank === 2 ? "2nd" : "3rd"} best</span>` : "";
    return `<tr><td>${esc(b.name)}</td><td class="num">${fmtClock(b.sec)}</td><td class="num">${fmtPace(b.sec / (b.dist / 1000))} /km</td><td>${badge}</td></tr>`;
  }).join("");
  $("#efforts-note").textContent = others.length
    ? `Ranks compare with the ${others.length} other ${isRun(act.sport) ? "runs" : "activities"} you’ve added.`
    : "Add more activities to see how these compare with your other runs.";
}

async function deleteCurrent() {
  const { summary } = state.current;
  if (!confirm(`Delete “${summary.name}” from this device?`)) return;
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
  $("#stat-fitness-sub").textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta)} vs 7 days ago`;
  $("#stat-fatigue").textContent = Math.round(now.atl);
  $("#stat-form").textContent = Math.round(now.ctl - now.atl);
  $("#stat-form-sub").textContent = formLabel(now.ctl - now.atl);
  const shown = state.fitnessRange ? f.slice(-state.fitnessRange) : f;
  drawFitness("chart-fitness", shown);
  drawForm("chart-form", shown);
  drawWeeklyLoad("chart-weekly-load", weeklyLoad(loads, today(), 12));
  const first = list[0], last = list.at(-1);
  $("#fitness-coverage").textContent =
    `Based on the ${list.length} ${list.length === 1 ? "activity" : "activities"} you’ve added (${fmtDate(first.start_date_local)} – ${fmtDate(last.start_date_local)}). ` +
    "It’s only accurate if you add all your activities, including easy ones, for at least the last 6 weeks.";
}

function formLabel(tsb) {
  if (tsb > 15) return "Fresh — possibly losing fitness";
  if (tsb > 5) return "Fresh";
  if (tsb > -10) return "Neutral";
  if (tsb > -30) return "Productive training";
  return "Very tired — injury risk";
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
    sel.innerHTML = opts.map((s) => `<option value="${esc(s)}">${s === "all" ? "All sports" : esc(sportLabel(s))}</option>`).join("");
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
    : period === "month" ? new Date(k + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" })
    : (long ? "Week of " : "") + new Date(k + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });
  drawVolume("chart-volume", vol, { unit, labelFor, sportColors: colors, sportLabel });
  const digits = metric === "count" || metric === "elevation" ? 0 : 1;
  $("#volume-totals").innerHTML = vol.sports.map((s) => {
    const v = vol.values[s].reduce((x, y) => x + y, 0);
    return `<li><span class="swatch" style="background:${colors[s]}"></span>${esc(sportLabel(s))}<b>${v.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}</b></li>`;
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
  if (!confirm("Delete all activities and settings from this device? This can’t be undone.")) return;
  await store.clear();
  try { localStorage.removeItem(SETTINGS_KEY); } catch { /* ignore */ }
  location.hash = "#/";
  location.reload();
}

// ================= handlers =================

function wireHandlers() {
  $("#strava-link").addEventListener("input", onStravaLinkInput);
  $("#strava-download").addEventListener("click", (e) => {
    if (!$("#strava-download").getAttribute("href")) { e.preventDefault(); $("#strava-link").focus(); }
  });
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
  return (s || "Workout").replace(/([a-z])([A-Z])/g, "$1 $2").replace("E Bike", "E-Bike");
}
function fmtClock(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtMinSec(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m >= 60 ? fmtDuration(sec) : m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}
function fmtDate(local) {
  return new Date(local).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function fmtDateTime(local) {
  return new Date(local).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
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
