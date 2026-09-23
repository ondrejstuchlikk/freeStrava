// Pure computation: training load, fitness/fatigue/form, volume aggregation.
// No DOM, no network — tested with tests/metrics.test.js.
//
// Load is expressed on a TSS-like scale: 100 ≈ one hour at threshold.
// Method priority per activity: power (if FTP set) → heart rate → pace (runs)
// → duration-based estimate.

export const DEFAULT_SETTINGS = {
  maxHr: null,        // null = estimate from data
  restHr: 60,
  trimpK: 1.92,       // Banister coefficient: 1.92 (male), 1.67 (female)
  thresholdPace: null, // seconds per km; null = estimate from data
  ftp: null,          // watts; power-based load only when set
};

// Fraction of heart-rate reserve treated as "threshold" when scaling TRIMP.
const THRESHOLD_HRR = 0.85;
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const FOOT_TYPES = new Set([...RUN_TYPES, "Walk", "Hike"]);

// Assumed intensity (fraction of threshold) when nothing better is known.
const FALLBACK_IF = {
  Run: 0.75, TrailRun: 0.75, VirtualRun: 0.75,
  Ride: 0.65, VirtualRide: 0.7, GravelRide: 0.65, MountainBikeRide: 0.7, EBikeRide: 0.45,
  Swim: 0.7, Walk: 0.45, Hike: 0.55, WeightTraining: 0.6, Workout: 0.6,
  Rowing: 0.7, NordicSki: 0.7, AlpineSki: 0.5, Yoga: 0.35,
};

export function sportOf(a) {
  return a.sport_type || a.type || "Other";
}

/** Local calendar day "YYYY-MM-DD" of an activity (Strava's start_date_local). */
export function dayOf(a) {
  return (a.start_date_local || a.start_date).slice(0, 10);
}

/** Fill in estimated values for any settings the user left empty. */
export function resolveSettings(activities, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const est = { maxHr: false, thresholdPace: false };

  if (!s.maxHr) {
    // Highest HR seen, but never below 185: easy sessions alone would
    // otherwise produce a far-too-low max and push everything into Z5.
    let m = 0;
    for (const a of activities) if (a.max_heartrate > m) m = a.max_heartrate;
    s.maxHr = Math.max(185, Math.round(m));
    est.maxHr = true;
  }
  if (!s.thresholdPace) {
    // Best 20-minute (grade-adjusted) speed from file analysis × 0.95; else
    // fastest average speed over a 20–75 minute run, slightly discounted.
    let best = 0;
    for (const a of activities) {
      if (!RUN_TYPES.has(sportOf(a))) continue;
      const v = a.best20_speed ? a.best20_speed * 0.95
        : a.moving_time >= 1200 && a.moving_time <= 4500 && a.average_speed ? a.average_speed * 0.97 : 0;
      if (v > best) best = v;
    }
    s.thresholdPace = best > 1.5 ? Math.round(1000 / best) : 330; // 5:30/km default
    est.thresholdPace = true;
  }
  if (s.restHr >= s.maxHr) s.restHr = Math.round(s.maxHr * 0.35);
  return { settings: s, estimated: est };
}

function trimp(minutes, hrr, k) {
  return minutes * hrr * 0.64 * Math.exp(k * hrr);
}

/**
 * Training load for one activity.
 * @returns {{load:number, method:"power"|"hr"|"pace"|"est", intensity:number|null}}
 */
export function activityLoad(a, s) {
  // Load computed second-by-second from the activity file wins.
  if (typeof a.load === "number") return { load: a.load, method: a.load_method || "hr", intensity: null };
  const sec = a.moving_time || a.elapsed_time || 0;
  if (sec <= 0) return { load: 0, method: "est", intensity: null };
  const hours = sec / 3600;
  const sport = sportOf(a);

  const np = a.weighted_average_watts || (a.device_watts ? a.average_watts : null);
  if (s.ftp && np && a.device_watts) {
    const IF = np / s.ftp;
    return { load: hours * IF * IF * 100, method: "power", intensity: IF };
  }

  if (a.average_heartrate && s.maxHr > s.restHr) {
    const hrr = clamp((a.average_heartrate - s.restHr) / (s.maxHr - s.restHr), 0, 1);
    const ref = trimp(60, THRESHOLD_HRR, s.trimpK);
    return { load: (trimp(sec / 60, hrr, s.trimpK) / ref) * 100, method: "hr", intensity: hrr / THRESHOLD_HRR };
  }

  if (FOOT_TYPES.has(sport) && a.average_speed > 0 && s.thresholdPace) {
    const IF = clamp(a.average_speed / (1000 / s.thresholdPace), 0, 1.3);
    return { load: hours * IF * IF * 100, method: "pace", intensity: IF };
  }

  const IF = FALLBACK_IF[sport] ?? 0.6;
  return { load: hours * IF * IF * 100, method: "est", intensity: IF };
}

// ---- dates (all UTC arithmetic on "YYYY-MM-DD" strings; no DST surprises) ----

export function parseDay(d) {
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
}
export function fmtDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(d, n) {
  return fmtDay(parseDay(d) + n * 86400000);
}
/** Monday of the ISO week containing day d. */
export function weekStart(d) {
  const ms = parseDay(d);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon=0
  return fmtDay(ms - dow * 86400000);
}
export function periodKey(d, period) {
  if (period === "week") return weekStart(d);
  if (period === "month") return d.slice(0, 7);
  return d.slice(0, 4);
}
function nextPeriod(key, period) {
  if (period === "week") return addDays(key, 7);
  if (period === "month") {
    let y = +key.slice(0, 4), m = +key.slice(5, 7) + 1;
    if (m > 12) { m = 1; y++; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  return String(+key + 1);
}

/**
 * Daily fitness (CTL, 42-day), fatigue (ATL, 7-day) and form (TSB).
 * Form on day t is yesterday's fitness minus yesterday's fatigue.
 * @param {Array<{day:string, load:number}>} items
 * @param {string} today "YYYY-MM-DD"; series runs through this day
 */
export function fitnessSeries(items, today, { ctlDays = 42, atlDays = 7 } = {}) {
  if (!items.length) return [];
  const byDay = new Map();
  let first = today;
  for (const { day, load } of items) {
    byDay.set(day, (byDay.get(day) || 0) + load);
    if (day < first) first = day;
  }
  const kc = 1 - Math.exp(-1 / ctlDays);
  const ka = 1 - Math.exp(-1 / atlDays);
  const out = [];
  let ctl = 0, atl = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const load = byDay.get(d) || 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    out.push({ day: d, load, ctl, atl, tsb });
  }
  return out;
}

/**
 * Sum a metric per period and sport.
 * metric: "distance" (km) | "time" (h) | "elevation" (m) | "count"
 * Returns { keys: [period…], sports: [sport…], values: {sport: [n…]} } with
 * empty periods filled in so the x-axis is continuous.
 */
export function volumeByPeriod(activities, { period = "week", metric = "distance", from = null, to = null } = {}) {
  const val = (a) =>
    metric === "distance" ? (a.distance || 0) / 1000
    : metric === "time" ? (a.moving_time || 0) / 3600
    : metric === "elevation" ? a.total_elevation_gain || 0
    : 1;

  const sums = new Map(); // sport -> Map(period -> value)
  let minK = null, maxK = null;
  for (const a of activities) {
    const d = dayOf(a);
    if ((from && d < from) || (to && d > to)) continue;
    const k = periodKey(d, period);
    const sport = sportOf(a);
    if (!sums.has(sport)) sums.set(sport, new Map());
    const m = sums.get(sport);
    m.set(k, (m.get(k) || 0) + val(a));
    if (minK === null || k < minK) minK = k;
    if (maxK === null || k > maxK) maxK = k;
  }
  if (minK === null) return { keys: [], sports: [], values: {} };
  if (to) { const tk = periodKey(to, period); if (tk > maxK) maxK = tk; }

  const keys = [];
  for (let k = minK; k <= maxK; k = nextPeriod(k, period)) keys.push(k);
  const totals = [...sums].map(([s, m]) => [s, [...m.values()].reduce((x, y) => x + y, 0)]);
  totals.sort((a, b) => b[1] - a[1]);
  const sports = totals.map(([s]) => s);
  const values = {};
  for (const s of sports) values[s] = keys.map((k) => sums.get(s).get(k) || 0);
  return { keys, sports, values };
}

/**
 * Weekly load with Strava-style "range": the typical band based on the
 * previous 3 weeks' average (×0.75 … ×1.25, rough approximation).
 */
export function weeklyLoad(loads, today, weeks = 12) {
  const byWeek = new Map();
  for (const { day, load } of loads) {
    const w = weekStart(day);
    byWeek.set(w, (byWeek.get(w) || 0) + load);
  }
  const thisWeek = weekStart(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const w = addDays(thisWeek, -7 * i);
    const prev = [1, 2, 3].map((j) => byWeek.get(addDays(w, -7 * j)) || 0);
    const avg = prev.reduce((x, y) => x + y, 0) / 3;
    out.push({ week: w, load: byWeek.get(w) || 0, low: avg * 0.75, high: avg * 1.25 });
  }
  return out;
}

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

// ---- formatting helpers shared by UI and export ----

export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
export function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return "";
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}
export function parsePace(str) {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(str || "");
  return m ? +m[1] * 60 + +m[2] : null;
}
