import { isConfigured } from "./config.js";
import { startLogin, handleRedirect, currentAuth, logout } from "./auth.js";
import { fetchActivities, DailyLimitError } from "./strava.js";
import { openCache, deleteCache } from "./db.js";
import {
  resolveSettings, activityLoad, fitnessSeries, volumeByPeriod, weeklyLoad,
  dayOf, sportOf, addDays, fmtDuration, fmtPace, parsePace, fmtDay,
} from "./metrics.js";
import { drawFitness, drawForm, drawWeeklyLoad, drawVolume, seriesColor } from "./charts.js";
import { download, toCsv } from "./export.js";
import { demoActivities } from "./demo.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  auth: null,
  cache: null,
  activities: [],   // raw Strava summaries, oldest first
  settings: {},     // user-entered (may have nulls)
  resolved: null,   // settings with estimates filled in
  estimated: {},
  loads: new Map(), // activity id → {load, method, intensity}
  fitness: [],
  sportColors: {},
  topSports: [],
  syncing: false,
  tab: "fitness",
  fitnessRange: 182,
  volume: { period: "week", metric: "distance", sport: "all" },
};

// ---------- boot ----------

async function boot() {
  wireStaticHandlers();
  if (new URLSearchParams(location.search).has("demo")) return openDemo();
  if (!isConfigured()) {
    show("landing");
    showLandingError("This copy of freeStrava isn’t set up yet (missing Client ID / Worker URL in js/config.js).");
    $("#connect").disabled = true;
    return;
  }
  try {
    const fresh = await handleRedirect();
    if (fresh) state.auth = fresh;
  } catch (e) {
    show("landing");
    showLandingError(e.message);
    return;
  }
  state.auth = state.auth || currentAuth();
  if (!state.auth) { show("landing"); return; }
  await openDashboard();
}

function show(view) {
  $("#landing").hidden = view !== "landing";
  $("#dashboard").hidden = view !== "dashboard";
}

function showLandingError(msg) {
  const el = $("#landing-error");
  el.textContent = msg;
  el.hidden = !msg;
}

async function openDashboard() {
  show("dashboard");
  const a = state.auth.athlete || {};
  $("#athlete-name").textContent = [a.firstname, a.lastname].filter(Boolean).join(" ") || "Athlete";
  if (a.profile_medium && a.profile_medium.startsWith("https://")) {
    $("#athlete-photo").src = a.profile_medium;
    $("#athlete-photo").hidden = false;
  }
  state.settings = loadSettings();
  state.cache = await openCache(a.id);
  state.activities = sortByDate(await state.cache.allActivities());
  recompute();
  render();
  sync();
}

/** Sample data, no Strava connection and nothing saved (visit ?demo). */
function openDemo() {
  state.demo = true;
  state.auth = { athlete: { id: "demo", firstname: "Demo", lastname: "Athlete" } };
  show("dashboard");
  $("#athlete-name").textContent = "Demo athlete";
  state.activities = sortByDate(demoActivities());
  recompute();
  render();
  setStatus(`Demo with ${state.activities.length} made-up activities — nothing here is real Strava data.`);
  $("#refresh").disabled = $("#full-resync").disabled = true;
  $("#disconnect").textContent = "Leave demo";
}

// ---------- sync ----------

async function sync({ full = false } = {}) {
  if (state.syncing) return;
  state.syncing = true;
  setSyncButtons(true);
  const ctrl = new AbortController();
  state.abort = ctrl;
  try {
    if (full) {
      await state.cache.clearActivities();
      state.activities = [];
      recompute(); render();
    }
    const newest = state.activities.at(-1);
    const after = newest ? Math.floor(Date.parse(newest.start_date) / 1000) : 0;
    setStatus(state.activities.length ? "Checking for new activities…" : "Loading your activities from Strava…", true);

    const byId = new Map(state.activities.map((x) => [x.id, x]));
    const added = await fetchActivities({
      after,
      signal: ctrl.signal,
      onPage: async (batch, total) => {
        await state.cache.putActivities(batch);
        for (const x of batch) byId.set(x.id, x);
        state.activities = sortByDate([...byId.values()]);
        recompute(); render();
        if (batch.length) setStatus(`Loaded ${total.toLocaleString()} ${full || !newest ? "" : "new "}activities…`, true);
      },
      onWait: (sec) => {
        if (sec > 0) setStatus(`Strava limits how fast this app can load data. Resuming in ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} — you can keep browsing meanwhile.`, true);
      },
    });
    await state.cache.setMeta("lastSync", Date.now());
    const count = state.activities.length.toLocaleString();
    setStatus(added ? `Up to date · ${count} activities (${added} new)` : `Up to date · ${count} activities`);
  } catch (e) {
    if (e.name === "AbortError") return;
    if (e.status === 401) {
      await logout({ revoke: false });
      show("landing");
      showLandingError(e.message);
      return;
    }
    setStatus(e instanceof DailyLimitError ? e.message : `Couldn’t finish loading: ${e.message}. Your saved data is still shown.`);
  } finally {
    state.syncing = false;
    setSyncButtons(false);
  }
}

function setStatus(msg, busy = false) {
  $("#sync-status").textContent = msg;
  $("#sync-status").classList.toggle("busy", busy);
}
function setSyncButtons(disabled) {
  $("#refresh").disabled = disabled;
  $("#full-resync").disabled = disabled;
}

// ---------- compute ----------

function sortByDate(list) {
  return list.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
}

function today() {
  const d = new Date();
  return fmtDay(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function recompute() {
  const { settings, estimated } = resolveSettings(state.activities, state.settings);
  state.resolved = settings;
  state.estimated = estimated;
  state.loads = new Map(state.activities.map((a) => [a.id, activityLoad(a, settings)]));
  state.fitness = fitnessSeries(
    state.activities.map((a) => ({ day: dayOf(a), load: state.loads.get(a.id).load })),
    today()
  );

  // Stable sport colors: rank sports by total time over the whole history.
  const time = new Map();
  for (const a of state.activities) time.set(sportOf(a), (time.get(sportOf(a)) || 0) + (a.moving_time || 0));
  const ranked = [...time].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  state.topSports = ranked.slice(0, ranked.length > 7 ? 6 : 7);
  state.sportColors = { Other: getComputedStyle(document.documentElement).getPropertyValue("--other").trim() };
  state.topSports.forEach((s, i) => (state.sportColors[s] = seriesColor(i)));
}

const sportGroup = (s) => (state.topSports.includes(s) ? s : "Other");
const sportLabel = (s) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace("E Bike", "E-Bike");

// ---------- render ----------

function render() {
  const empty = state.activities.length === 0;
  $("#empty").hidden = !empty || state.syncing;
  $$(".tab-panel").forEach((p) => (p.hidden = empty || p.id !== `panel-${state.tab}`));
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === state.tab)));
  if (empty) return;
  if (state.tab === "fitness") renderFitness();
  if (state.tab === "effort") renderEffort();
  if (state.tab === "volume") renderVolume();
  if (state.tab === "export") renderExport();
}

function formLabel(tsb) {
  if (tsb > 15) return "Fresh — possibly losing fitness";
  if (tsb > 5) return "Fresh";
  if (tsb > -10) return "Neutral";
  if (tsb > -30) return "Productive training";
  return "Very tired — injury risk";
}

function renderFitness() {
  const f = state.fitness;
  const now = f.at(-1);
  const weekAgo = f.at(-8) || f[0];
  const delta = Math.round(now.ctl - weekAgo.ctl);
  $("#stat-fitness").textContent = Math.round(now.ctl);
  $("#stat-fitness-sub").textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta)} vs 7 days ago`;
  $("#stat-fatigue").textContent = Math.round(now.atl);
  $("#stat-form").textContent = Math.round(now.ctl - now.atl);
  $("#stat-form-sub").textContent = formLabel(now.ctl - now.atl);

  const shown = state.fitnessRange ? f.slice(-state.fitnessRange) : f;
  drawFitness("chart-fitness", shown);
  drawForm("chart-form", shown);

  const methods = { hr: 0, pace: 0, power: 0, est: 0 };
  for (const l of state.loads.values()) methods[l.method]++;
  const total = state.activities.length;
  const parts = [
    methods.power && `${methods.power} from power`,
    methods.hr && `${methods.hr} from heart rate`,
    methods.pace && `${methods.pace} from pace`,
    methods.est && `${methods.est} estimated from duration only`,
  ].filter(Boolean);
  $("#load-methods").textContent = `Training load of your ${total.toLocaleString()} activities: ${parts.join(", ")}.`;
}

function renderEffort() {
  const loads = state.activities.map((a) => ({ day: dayOf(a), load: state.loads.get(a.id).load }));
  const weeks = weeklyLoad(loads, today(), 12);
  drawWeeklyLoad("chart-weekly-load", weeks);
  const cur = weeks.at(-1);
  const verdict = cur.high === 0 ? "" :
    cur.load > cur.high ? "above your typical range — a big week." :
    cur.load >= cur.low ? "within your typical range." :
    "below your typical range so far.";
  $("#effort-summary").textContent = verdict ? `This week’s load (${Math.round(cur.load)}) is ${verdict}` : "";

  const rows = state.activities.slice(-60).reverse();
  const methodName = { hr: "HR", pace: "Pace", power: "Power", est: "Est." };
  $("#effort-rows").innerHTML = rows.map((a) => {
    const l = state.loads.get(a.id);
    return `<tr>
      <td>${esc(new Date(dayOf(a) + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }))}</td>
      <td class="name"><a href="https://www.strava.com/activities/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a><span class="muted">${esc(sportLabel(sportOf(a)))} · ${fmtDuration(a.moving_time || 0)}</span></td>
      <td class="num">${Math.round(l.load)}<span class="muted">${methodName[l.method]}</span></td>
      <td class="num">${a.suffer_score != null ? Math.round(a.suffer_score) : "–"}</td>
      <td class="num">${a.average_heartrate ? Math.round(a.average_heartrate) : "–"}</td>
    </tr>`;
  }).join("");
}

function renderVolume() {
  const { period, metric, sport } = state.volume;
  const span = { week: 26 * 7, month: 730, year: null }[period];
  const from = span ? addDays(today(), -span) : null;
  let acts = state.activities;
  if (sport !== "all") acts = acts.filter((a) => sportGroup(sportOf(a)) === sport);
  const grouped = acts.map((a) => ({ ...a, sport_type: sportGroup(sportOf(a)) }));
  const vol = volumeByPeriod(grouped, { period, metric, from, to: today() });
  const unit = { distance: "km", time: "h", elevation: "m", count: "" }[metric];
  const labelFor = (k, long = false) =>
    period === "year" ? k
    : period === "month" ? new Date(k + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" })
    : (long ? "Week of " : "") + new Date(k + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });
  drawVolume("chart-volume", vol, { unit, labelFor, sportColors: state.sportColors, sportLabel });

  // Sport filter options (stable order = color order).
  const sel = $("#vol-sport");
  const hasOther = state.activities.some((a) => sportGroup(sportOf(a)) === "Other");
  const opts = ["all", ...state.topSports, ...(hasOther ? ["Other"] : [])];
  if (sel.dataset.sig !== opts.join()) {
    sel.innerHTML = opts.map((s) => `<option value="${esc(s)}">${s === "all" ? "All sports" : esc(sportLabel(s))}</option>`).join("");
    sel.dataset.sig = opts.join();
    if (!opts.includes(sport)) state.volume.sport = "all";
    sel.value = state.volume.sport;
  }

  // Totals table for the visible range.
  const totals = vol.keys.length ? vol.sports.map((s) => [s, vol.values[s].reduce((x, y) => x + y, 0)]) : [];
  const digits = metric === "count" || metric === "elevation" ? 0 : 1;
  $("#volume-totals").innerHTML = totals.map(([s, v]) =>
    `<li><span class="swatch" style="background:${state.sportColors[s]}"></span>${esc(sportLabel(s))}<b>${v.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}</b></li>`
  ).join("");
}

function renderExport() {
  $("#export-count").textContent = state.activities.length.toLocaleString();
}

// ---------- export ----------

function exportJson() {
  download(`strava-activities-${today()}.json`, JSON.stringify(state.activities, null, 2), "application/json");
}

function exportCsv() {
  const foot = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);
  const r1 = (x) => (x == null ? "" : Math.round(x * 10) / 10);
  const cols = [
    ["id", (a) => a.id],
    ["date_local", (a) => (a.start_date_local || "").replace("Z", "").replace("T", " ")],
    ["name", (a) => a.name],
    ["sport", (a) => sportOf(a)],
    ["distance_km", (a) => r1((a.distance || 0) / 1000)],
    ["moving_time_min", (a) => r1((a.moving_time || 0) / 60)],
    ["elapsed_time_min", (a) => r1((a.elapsed_time || 0) / 60)],
    ["elevation_gain_m", (a) => r1(a.total_elevation_gain)],
    ["avg_speed_kmh", (a) => (a.average_speed ? r1(a.average_speed * 3.6) : "")],
    ["avg_pace_min_per_km", (a) => (foot.has(sportOf(a)) && a.average_speed ? fmtPace(1000 / a.average_speed) : "")],
    ["avg_hr", (a) => r1(a.average_heartrate)],
    ["max_hr", (a) => r1(a.max_heartrate)],
    ["avg_watts", (a) => r1(a.average_watts)],
    ["weighted_avg_watts", (a) => r1(a.weighted_average_watts)],
    ["kilojoules", (a) => r1(a.kilojoules)],
    ["strava_relative_effort", (a) => a.suffer_score ?? ""],
    ["training_load", (a) => r1(state.loads.get(a.id).load)],
    ["load_method", (a) => state.loads.get(a.id).method],
    ["commute", (a) => a.commute],
    ["trainer", (a) => a.trainer],
    ["gear_id", (a) => a.gear_id],
    ["kudos", (a) => a.kudos_count],
  ];
  download(`strava-activities-${today()}.csv`, toCsv(state.activities, cols), "text/csv");
}

function exportFitness() {
  const r1 = (x) => Math.round(x * 10) / 10;
  const cols = [
    ["date", (p) => p.day],
    ["training_load", (p) => r1(p.load)],
    ["fitness_ctl", (p) => r1(p.ctl)],
    ["fatigue_atl", (p) => r1(p.atl)],
    ["form_tsb", (p) => r1(p.tsb)],
  ];
  download(`strava-fitness-${today()}.csv`, toCsv(state.fitness, cols), "text/csv");
}

// ---------- settings ----------

function settingsKey() {
  return `freestrava.settings.${state.auth.athlete?.id}`;
}
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey())) || {};
    if (saved.trimpK == null && state.auth.athlete?.sex === "F") saved.trimpK = 1.67;
    return saved;
  } catch { return {}; }
}

function openSettings() {
  const s = state.settings, r = state.resolved;
  $("#set-maxhr").value = s.maxHr || "";
  $("#set-maxhr").placeholder = r.maxHr + (state.estimated.maxHr ? " (estimated)" : "");
  $("#set-resthr").value = s.restHr || "";
  $("#set-resthr").placeholder = String(r.restHr);
  $("#set-sex").value = String(r.trimpK);
  $("#set-pace").value = s.thresholdPace ? fmtPace(s.thresholdPace) : "";
  $("#set-pace").placeholder = fmtPace(r.thresholdPace) + (state.estimated.thresholdPace ? " (estimated)" : "");
  $("#set-ftp").value = s.ftp || "";
  $("#settings").showModal();
}

function saveSettings(e) {
  e.preventDefault();
  const num = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) && v > 0 ? v : null; };
  const pace = parsePace($("#set-pace").value);
  if ($("#set-pace").value.trim() && !pace) {
    $("#set-pace").setCustomValidity("Use minutes:seconds, e.g. 4:45");
    $("#set-pace").reportValidity();
    return;
  }
  state.settings = {
    maxHr: num("#set-maxhr"),
    restHr: num("#set-resthr") || 60,
    trimpK: parseFloat($("#set-sex").value),
    thresholdPace: pace,
    ftp: num("#set-ftp"),
  };
  localStorage.setItem(settingsKey(), JSON.stringify(state.settings));
  $("#settings").close();
  recompute(); render();
}

// ---------- handlers ----------

function wireStaticHandlers() {
  $("#connect").addEventListener("click", startLogin);
  $("#refresh").addEventListener("click", () => sync());
  $("#full-resync").addEventListener("click", () => {
    if (confirm("Reload your whole activity history from Strava? This uses more of the shared request limit.")) sync({ full: true });
  });
  $("#disconnect").addEventListener("click", async () => {
    if (state.demo) { location.assign(location.pathname); return; }
    if (!confirm("Disconnect from Strava and delete your data from this browser?")) return;
    state.abort?.abort();
    const id = state.auth?.athlete?.id;
    state.cache?.close();
    await logout();
    if (id) { await deleteCache(id); localStorage.removeItem(`freestrava.settings.${id}`); }
    location.reload();
  });
  $$(".tab").forEach((t) => t.addEventListener("click", () => { state.tab = t.dataset.tab; render(); }));
  $$("#fitness-range button").forEach((b) => b.addEventListener("click", () => {
    state.fitnessRange = Number(b.dataset.days) || 0;
    $$("#fitness-range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));
  for (const [id, key] of [["#vol-period", "period"], ["#vol-metric", "metric"], ["#vol-sport", "sport"]]) {
    $(id).addEventListener("change", (e) => { state.volume[key] = e.target.value; render(); });
  }
  $("#export-json").addEventListener("click", exportJson);
  $("#export-csv").addEventListener("click", exportCsv);
  $("#export-fitness").addEventListener("click", exportFitness);
  $("#open-settings").addEventListener("click", openSettings);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#settings-cancel").addEventListener("click", () => $("#settings").close());
  $("#set-pace").addEventListener("input", (e) => e.target.setCustomValidity(""));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.activities.length) { recompute(); render(); }
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

boot();
