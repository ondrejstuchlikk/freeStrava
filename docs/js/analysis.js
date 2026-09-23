// Deep analysis of one activity (output of activity.js). Pure, no DOM.
//
// Where Strava's exact formula is proprietary (Relative Effort, grade-adjusted
// pace) we use close equivalents and label them as estimates in the UI.

const FOOT = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);
const RUN = new Set(["Run", "TrailRun", "VirtualRun"]);
const THRESHOLD_HRR = 0.85; // same scaling as metrics.js: 1 h at 85% HRR = 100

export const isFoot = (sport) => FOOT.has(sport);
export const isRun = (sport) => RUN.has(sport);

export const BEST_EFFORT_DISTANCES = [
  ["400 m", 400], ["½ mile", 804.67], ["1 km", 1000], ["1 mile", 1609.34], ["2 mile", 3218.69],
  ["5 km", 5000], ["10 km", 10000], ["15 km", 15000], ["10 mile", 16093.4], ["20 km", 20000],
  ["Half marathon", 21097.5], ["30 km", 30000], ["Marathon", 42195],
];
export const POWER_DURATIONS = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

export const HR_ZONES = [
  ["Z1 Recovery", 0, 0.6], ["Z2 Endurance", 0.6, 0.7], ["Z3 Tempo", 0.7, 0.8],
  ["Z4 Threshold", 0.8, 0.9], ["Z5 Anaerobic", 0.9, Infinity],
];
// Fraction of threshold speed (grade-adjusted).
export const PACE_ZONES = [
  ["Z1 Recovery", 0, 0.78], ["Z2 Endurance", 0.78, 0.88], ["Z3 Tempo", 0.88, 0.95],
  ["Z4 Threshold", 0.95, 1.02], ["Z5 VO₂ max", 1.02, 1.1], ["Z6 Anaerobic", 1.1, Infinity],
];
// Coggan power levels, fraction of FTP.
export const POWER_ZONES = [
  ["Z1 Recovery", 0, 0.55], ["Z2 Endurance", 0.55, 0.75], ["Z3 Tempo", 0.75, 0.9],
  ["Z4 Threshold", 0.9, 1.05], ["Z5 VO₂ max", 1.05, 1.2], ["Z6 Anaerobic", 1.2, 1.5],
  ["Z7 Neuromuscular", 1.5, Infinity],
];

/**
 * Relative effort of running on gradient i (fraction, 0.05 = 5%) vs flat.
 * Polynomial fitted to Strava's published 2017 GAP curve (real-world HR data).
 * The lab-based Minetti formula over-rewards gentle downhills on real runs.
 */
export function gradeFactor(i) {
  const g = Math.max(-30, Math.min(30, i * 100));
  const f = (x) => 0.98462 + 0.030266 * x + 0.0018814 * x ** 2 - 3.3882e-6 * x ** 3 - 4.5704e-7 * x ** 4;
  return f(g) / f(0);
}

/**
 * @param act  normalized activity
 * @param s    resolved settings {maxHr, restHr, trimpK, thresholdPace (s/km), ftp}
 */
export function analyze(act, s) {
  const { n, t, dist } = act;
  const foot = FOOT.has(act.sport);
  const hasGps = !!act.lat;
  const distanceBased = dist[n - 1] > 100;

  // ---- time deltas & moving mask ----
  const dt = new Array(n).fill(0);
  for (let i = 1; i < n; i++) dt[i] = Math.max(0, t[i] - t[i - 1]);

  // Raw speed over a short trailing window, used only to detect stops.
  const minSpeed = foot ? 0.5 : 1.0;
  const moving = new Array(n).fill(0);
  for (let i = 1, k = 0; i < n; i++) {
    while (k < i - 1 && t[i] - t[k] > 6) k++;
    const span = t[i] - t[k];
    const v = span > 0 ? (dist[i] - dist[k]) / span : 0;
    const timer = act.timerOn[i] && act.timerOn[i - 1];
    moving[i] = timer && dt[i] <= 60 && (!distanceBased || v >= minSpeed) ? 1 : 0;
  }
  // Active (moving) time, cumulative.
  const at = new Array(n).fill(0);
  for (let i = 1; i < n; i++) at[i] = at[i - 1] + (moving[i] ? dt[i] : 0);
  const movingTime = at[n - 1];
  const elapsedTime = t[n - 1] - t[0];
  const distance = dist[n - 1];

  // ---- smoothed speed (centered ~30 s window of moving time) ----
  const speed = centeredRate(dist, at, 15);

  // ---- elevation: smooth, grade over ±40 m, gain with hysteresis ----
  let altS = null, grade = null, gain = null, loss = null;
  if (act.alt) {
    altS = movingAverage(act.alt, 10);
    grade = new Array(n).fill(0);
    for (let i = 0, a = 0, b = 0; i < n; i++) {
      while (a < i && dist[i] - dist[a] > 40) a++;
      while (b < n - 1 && dist[b] - dist[i] < 40) b++;
      const dd = dist[b] - dist[a];
      grade[i] = dd > 20 ? clamp((altS[b] - altS[a]) / dd, -0.45, 0.45) : 0;
    }
    [gain, loss] = climb(altS, 3);
    if (act.totals.ascent != null) gain = act.totals.ascent; // device value, usually barometric/corrected
  }

  // ---- grade-adjusted distance (runs/walks) ----
  const gapDist = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dd = dist[i] - dist[i - 1];
    gapDist[i] = gapDist[i - 1] + (foot && grade ? dd * gradeFactor(grade[i]) : dd);
  }
  const gapSpeed = foot && grade ? centeredRate(gapDist, at, 15) : speed;

  // ---- heart rate ----
  let avgHr = null, maxHr = null;
  if (act.hr) {
    avgHr = weightedMean(act.hr, dt, moving);
    maxHr = maxOf(movingAverage(act.hr, 3));
  }

  // ---- power ----
  let avgPower = null, np = null, powerCurve = null;
  if (act.power) {
    avgPower = weightedMean(act.power, dt, moving);
    const p1 = resample1Hz(act.power, at, moving);
    np = normalizedPower(p1);
    powerCurve = POWER_DURATIONS.filter((d) => d <= p1.length).map((d) => ({ sec: d, watts: bestRollingMean(p1, d) }));
  }

  // ---- cadence (running cadence in FIT is per leg → steps/min = ×2) ----
  let avgCad = null;
  if (act.cad) {
    avgCad = weightedMean(act.cad, dt, moving);
    if (foot && act.source === "fit" && avgCad && avgCad < 120) avgCad *= 2;
  }

  // ---- threshold speed / zones ----
  const vt = s.thresholdPace ? 1000 / s.thresholdPace : null;
  const zones = {};
  if (act.hr && s.maxHr) {
    zones.hr = timeInZones(HR_ZONES, (i) => act.hr[i] != null ? act.hr[i] / s.maxHr : null, dt, moving, n)
      .map((z) => ({ ...z, lo: Math.round(z.min * s.maxHr), hi: z.max === Infinity ? null : Math.round(z.max * s.maxHr) }));
  }
  if (RUN.has(act.sport) && vt && distanceBased) {
    zones.pace = timeInZones(PACE_ZONES, (i) => gapSpeed[i] / vt, dt, moving, n)
      .map((z) => ({ ...z, fast: z.max === Infinity ? null : s.thresholdPace / z.max, slow: z.min ? s.thresholdPace / z.min : null }));
  }
  if (act.power && s.ftp) {
    zones.power = timeInZones(POWER_ZONES, (i) => act.power[i] != null ? act.power[i] / s.ftp : null, dt, moving, n)
      .map((z) => ({ ...z, lo: Math.round(z.min * s.ftp), hi: z.max === Infinity ? null : Math.round(z.max * s.ftp) }));
  }

  // ---- training load / effort ----
  let load = 0, loadMethod = "est";
  if (np && s.ftp) {
    const IF = np / s.ftp;
    load = (movingTime / 3600) * IF * IF * 100;
    loadMethod = "power";
  } else if (act.hr && s.maxHr > s.restHr) {
    const ref = 60 * THRESHOLD_HRR * 0.64 * Math.exp(s.trimpK * THRESHOLD_HRR);
    let trimp = 0;
    for (let i = 1; i < n; i++) {
      if (!moving[i] || act.hr[i] == null) continue;
      const hrr = clamp((act.hr[i] - s.restHr) / (s.maxHr - s.restHr), 0, 1);
      trimp += (dt[i] / 60) * hrr * 0.64 * Math.exp(s.trimpK * hrr);
    }
    load = (trimp / ref) * 100;
    loadMethod = "hr";
  } else if (foot && vt && distanceBased && movingTime > 0) {
    const IF = clamp(gapDist[n - 1] / movingTime / vt, 0, 1.3);
    load = (movingTime / 3600) * IF * IF * 100;
    loadMethod = "pace";
  }

  // ---- aerobic decoupling (pace:HR drift, first vs second half) ----
  let decoupling = null;
  if (act.hr && distanceBased && movingTime >= 1200) {
    const half = movingTime / 2;
    const ef = [0, 1].map((h) => {
      let d = 0, hrSum = 0, time = 0;
      for (let i = 1; i < n; i++) {
        if (!moving[i] || act.hr[i] == null || (at[i] <= half) !== (h === 0)) continue;
        d += gapDist[i] - gapDist[i - 1];
        hrSum += act.hr[i] * dt[i];
        time += dt[i];
      }
      return time ? (d / time) / (hrSum / time) : null;
    });
    if (ef[0] && ef[1]) decoupling = ((ef[0] - ef[1]) / ef[0]) * 100;
  }

  // ---- pauses ----
  const pauses = [];
  for (let i = 1; i < n; i++) {
    if (moving[i]) continue;
    let j = i;
    while (j < n && !moving[j]) j++;
    const dur = t[Math.min(j, n - 1)] - t[i - 1];
    if (dur >= 10) pauses.push({ atKm: dist[i] / 1000, sec: dur });
    i = j;
  }

  // ---- splits (per km) ----
  const splits = distanceBased ? makeSplits(act, at, gapDist, dt, moving, altS, 1000) : [];

  // ---- best efforts ----
  const bestEfforts = distanceBased
    ? BEST_EFFORT_DISTANCES.filter(([, d]) => d <= distance).map(([name, d]) => {
        const r = fastestDistance(dist, at, d);
        return r && { name, dist: d, sec: r.sec, startKm: r.startDist / 1000 };
      }).filter(Boolean)
    : [];
  const best20 = distanceBased && movingTime >= 1200 ? fastestDuration(gapDist, at, 1200) : null;

  // ---- chart series (≤ ~800 points) ----
  const xKind = distanceBased ? "km" : "min";
  const xRaw = distanceBased ? dist.map((d) => d / 1000) : at.map((a) => a / 60);
  const cols = {
    speed: speed.map((v, i) => (moving[i] ? v : null)),
    gapSpeed: gapSpeed.map((v, i) => (moving[i] ? v : null)),
    hr: act.hr,
    alt: altS,
    grade,
    cad: act.cad && foot && act.source === "fit" ? act.cad.map((c) => (c != null && c < 120 ? c * 2 : c)) : act.cad,
    power: act.power,
  };
  const series = downsample(xRaw, cols, moving, 800);
  series.xKind = xKind;

  // ---- map track (≤ ~2000 points) ----
  let track = null;
  if (hasGps) {
    const step = Math.max(1, Math.floor(n / 2000));
    track = [];
    for (let i = 0; i < n; i += step) {
      if (act.lat[i] == null) continue;
      track.push({
        lat: act.lat[i], lon: act.lon[i], km: dist[i] / 1000,
        speed: moving[i] ? gapSpeed[i] : null, hr: act.hr?.[i] ?? null, grade: grade?.[i] ?? null,
      });
    }
  }

  const avgSpeed = movingTime ? distance / movingTime : null;
  const avgGapSpeed = movingTime ? gapDist[n - 1] / movingTime : null;

  return {
    summary: {
      distance, movingTime, elapsedTime, avgSpeed, avgGapSpeed,
      maxSpeed: maxOf(cols.speed),
      elevGain: gain, elevLoss: loss,
      avgHr, maxHr, avgCad, avgPower, np,
      load, loadMethod, decoupling,
      stoppedTime: elapsedTime - movingTime, pauses,
      best20Speed: best20 ? best20.dist / 1200 : null,
      minAlt: altS ? minOf(altS) : null, maxAlt: altS ? maxOf(altS) : null,
      avgTemp: act.temp ? weightedMean(act.temp, dt, moving) : null,
    },
    series, splits, bestEfforts, powerCurve, zones, track,
  };
}

// ---------------- helpers ----------------

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function maxOf(a) { let m = null; for (const v of a) if (v != null && (m === null || v > m)) m = v; return m; }
function minOf(a) { let m = null; for (const v of a) if (v != null && (m === null || v < m)) m = v; return m; }

function weightedMean(vals, dt, mask) {
  let s = 0, w = 0;
  for (let i = 1; i < vals.length; i++) {
    if (!mask[i] || vals[i] == null) continue;
    s += vals[i] * dt[i]; w += dt[i];
  }
  return w ? s / w : null;
}

function movingAverage(a, half) {
  const out = new Array(a.length);
  let sum = 0, cnt = 0, lo = 0, hi = -1;
  for (let i = 0; i < a.length; i++) {
    while (hi < Math.min(a.length - 1, i + half)) { hi++; if (a[hi] != null) { sum += a[hi]; cnt++; } }
    while (lo < i - half) { if (a[lo] != null) { sum -= a[lo]; cnt--; } lo++; }
    out[i] = cnt ? sum / cnt : null;
  }
  return out;
}

/** d(y)/d(x) over a centered window of ±half in x (x = moving time). */
function centeredRate(y, x, half) {
  const n = y.length, out = new Array(n).fill(0);
  for (let i = 0, a = 0, b = 0; i < n; i++) {
    while (a < i && x[i] - x[a] > half) a++;
    if (b < i) b = i;
    while (b < n - 1 && x[b + 1] - x[i] <= half) b++;
    const dx = x[b] - x[a];
    out[i] = dx > 0 ? (y[b] - y[a]) / dx : i ? out[i - 1] : 0;
  }
  return out;
}

/** Total ascent/descent with a hysteresis threshold (metres). */
function climb(alt, threshold) {
  let gain = 0, loss = 0, ref = alt[0];
  for (const v of alt) {
    if (v == null) continue;
    if (v - ref >= threshold) { gain += v - ref; ref = v; }
    else if (ref - v >= threshold) { loss += ref - v; ref = v; }
  }
  return [gain, loss];
}

function timeInZones(zones, ratioAt, dt, moving, n) {
  const sec = zones.map(() => 0);
  for (let i = 1; i < n; i++) {
    if (!moving[i]) continue;
    const r = ratioAt(i);
    if (r == null) continue;
    const z = zones.findIndex(([, lo, hi]) => r >= lo && r < hi);
    sec[z === -1 ? 0 : z] += dt[i];
  }
  return zones.map(([name, min, max], i) => ({ name, min, max, sec: sec[i] }));
}

/** Fastest time to cover `d` metres, measured in moving time. */
function fastestDistance(dist, at, d) {
  let best = null, k = 0;
  for (let j = 1; j < dist.length; j++) {
    const target = dist[j] - d;
    if (target < 0) continue;
    while (k + 1 < j && dist[k + 1] <= target) k++;
    // Interpolate the moving time at which `target` was passed.
    const span = dist[k + 1] - dist[k];
    const f = span > 0 ? clamp((target - dist[k]) / span, 0, 1) : 0;
    const tStart = at[k] + f * (at[k + 1] - at[k]);
    const sec = at[j] - tStart;
    if (sec > 0 && (!best || sec < best.sec)) best = { sec, startDist: target };
  }
  return best;
}

/** Longest distance covered in `sec` seconds of moving time. */
function fastestDuration(dist, at, sec) {
  let best = null, k = 0;
  for (let j = 1; j < dist.length; j++) {
    if (at[j] < sec) continue;
    while (k + 1 < j && at[j] - at[k + 1] >= sec) k++;
    const d = dist[j] - dist[k];
    if (!best || d > best.dist) best = { dist: d, sec };
  }
  return best;
}

function resample1Hz(vals, at, moving) {
  const out = [];
  let next = 0;
  for (let i = 1; i < vals.length; i++) {
    if (!moving[i]) continue;
    while (next < at[i]) { out.push(vals[i] ?? 0); next++; }
  }
  return out;
}

function bestRollingMean(p, d) {
  let sum = 0, best = 0;
  for (let i = 0; i < p.length; i++) {
    sum += p[i];
    if (i >= d) sum -= p[i - d];
    if (i >= d - 1) best = Math.max(best, sum / d);
  }
  return best;
}

function normalizedPower(p) {
  if (p.length < 30) return null;
  const r = [];
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    sum += p[i];
    if (i >= 30) sum -= p[i - 30];
    if (i >= 29) r.push((sum / 30) ** 4);
  }
  return (r.reduce((a, b) => a + b, 0) / r.length) ** 0.25;
}

function makeSplits(act, at, gapDist, dt, moving, altS, unit) {
  const { n, dist } = act;
  const splits = [];
  let startIdx = 0, startAt = 0, startGap = 0, next = unit;
  const interp = (arr, i, target) => {
    const span = dist[i] - dist[i - 1];
    const f = span > 0 ? (target - dist[i - 1]) / span : 1;
    return arr[i - 1] + f * (arr[i] - arr[i - 1]);
  };
  const close = (i, endDist, endAt, endGap) => {
    let hrSum = 0, hrT = 0, up = 0, down = 0;
    for (let k = Math.max(1, startIdx + 1); k <= i; k++) {
      if (moving[k] && act.hr?.[k] != null) { hrSum += act.hr[k] * dt[k]; hrT += dt[k]; }
      if (altS) { const dAlt = altS[k] - altS[k - 1]; if (dAlt > 0) up += dAlt; else down -= dAlt; }
    }
    const d = endDist - (splits.length ? splits.length * unit : 0);
    const time = endAt - startAt;
    splits.push({
      n: splits.length + 1,
      dist: d,
      time,
      pace: d > 0 ? time / (d / 1000) : null,
      gapPace: endGap - startGap > 0 ? time / ((endGap - startGap) / 1000) : null,
      hr: hrT ? hrSum / hrT : null,
      elev: altS ? altS[i] - altS[startIdx] : null,
      up, down,
    });
  };
  for (let i = 1; i < n; i++) {
    while (dist[i] >= next) {
      const endAt = interp(at, i, next), endGap = interp(gapDist, i, next);
      close(i, next, endAt, endGap);
      startIdx = i; startAt = endAt; startGap = endGap; next += unit;
    }
  }
  const rest = dist[n - 1] - (next - unit);
  if (rest >= 50) close(n - 1, dist[n - 1], at[n - 1], gapDist[n - 1]);
  return splits;
}

/** Bucket-average columns over x into ≤ max points. Non-moving samples are skipped. */
function downsample(x, cols, moving, max) {
  const n = x.length;
  const keys = Object.keys(cols).filter((k) => cols[k]);
  const bucket = Math.max(1, Math.ceil(n / max));
  const out = { x: [] };
  for (const k of keys) out[k] = [];
  for (let s = 0; s < n; s += bucket) {
    const e = Math.min(n, s + bucket);
    let xs = 0, xc = 0;
    const sums = {}, cnts = {};
    for (let i = s; i < e; i++) {
      xs += x[i]; xc++;
      for (const k of keys) {
        const v = cols[k][i];
        if (v == null || (!moving[i] && k !== "alt")) continue;
        sums[k] = (sums[k] || 0) + v; cnts[k] = (cnts[k] || 0) + 1;
      }
    }
    // Keep x strictly non-decreasing (float rounding can nudge the last bucket back,
    // which makes Chart.js draw a stray fill polygon).
    out.x.push(Math.max(xs / xc, out.x.at(-1) ?? -Infinity));
    for (const k of keys) out[k].push(cnts[k] ? sums[k] / cnts[k] : null);
  }
  return out;
}
