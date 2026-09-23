// Run: ./tests/run.sh   (uses macOS's built-in JavaScriptCore; no Node needed)
import {
  resolveSettings, activityLoad, fitnessSeries, volumeByPeriod, weeklyLoad,
  weekStart, addDays, fmtPace, parsePace,
} from "../docs/js/metrics.js";

let failed = 0, passed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; print("FAIL: " + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`); }

// dates
ok(weekStart("2026-09-23") === "2026-09-21", "weekStart Wed → Mon");
ok(weekStart("2026-09-21") === "2026-09-21", "weekStart Mon stays");
ok(weekStart("2026-09-27") === "2026-09-21", "weekStart Sun → previous Mon");
ok(addDays("2024-02-28", 2) === "2024-03-01", "addDays leap year");
ok(addDays("2026-03-28", 2) === "2026-03-30", "addDays across DST");

// pace
ok(fmtPace(330) === "5:30", "fmtPace");
ok(parsePace("4:05") === 245, "parsePace");
ok(parsePace("abc") === null, "parsePace invalid");

// settings estimation
const acts = [
  { sport_type: "Run", moving_time: 1800, average_speed: 3.5, max_heartrate: 186, start_date_local: "2026-09-01T07:00:00Z" },
  { sport_type: "Run", moving_time: 600, average_speed: 5.0, start_date_local: "2026-09-02T07:00:00Z" },
];
const { settings: s, estimated } = resolveSettings(acts, {});
ok(s.maxHr === 186 && estimated.maxHr, "maxHr estimated from data");
near(s.thresholdPace, 1000 / (3.5 * 0.97), 1, "threshold pace ignores short runs");

// loads: 1 h at threshold HRR ≈ 100
const hrS = { ...s, maxHr: 190, restHr: 50, ftp: null };
const thrHr = 50 + 0.85 * 140;
near(activityLoad({ sport_type: "Ride", moving_time: 3600, average_heartrate: thrHr }, hrS).load, 100, 0.01, "HR load at threshold = 100/h");
ok(activityLoad({ sport_type: "Ride", moving_time: 3600, average_heartrate: 120 }, hrS).load < 100, "easy HR < 100/h");
const p = activityLoad({ sport_type: "Run", moving_time: 3600, average_speed: 1000 / 300 }, { ...hrS, thresholdPace: 300 });
ok(p.method === "pace", "pace method when no HR");
near(p.load, 100, 0.01, "pace load at threshold = 100/h");
const pw = activityLoad({ sport_type: "Ride", moving_time: 7200, weighted_average_watts: 200, device_watts: true, average_heartrate: 150 }, { ...hrS, ftp: 250 });
ok(pw.method === "power", "power preferred when FTP set");
near(pw.load, 2 * 0.64 * 100, 0.01, "power TSS");
ok(activityLoad({ sport_type: "Yoga", moving_time: 3600 }, hrS).method === "est", "fallback estimate");
ok(activityLoad({ sport_type: "Run", moving_time: 0 }, hrS).load === 0, "zero duration");

// fitness: constant 100/day converges toward 100; TSB uses previous day
const items = [];
for (let i = 0; i < 400; i++) items.push({ day: addDays("2025-01-01", i), load: 100 });
const f = fitnessSeries(items, addDays("2025-01-01", 399));
ok(f.length === 400, "one point per day");
near(f[399].ctl, 100, 0.1, "CTL converges");
near(f[399].atl, 100, 0.01, "ATL converges");
ok(f[0].tsb === 0 && f[1].tsb < 0, "TSB lags one day and goes negative when fatigue rises");
const gap = fitnessSeries([{ day: "2026-01-01", load: 50 }, { day: "2026-01-01", load: 50 }], "2026-01-10");
ok(gap.length === 10 && gap[0].load === 100, "same-day loads summed, rest days filled");

// volume
const v = volumeByPeriod([
  { sport_type: "Run", distance: 10000, start_date_local: "2026-09-01T07:00:00Z" },
  { sport_type: "Ride", distance: 40000, start_date_local: "2026-09-15T07:00:00Z" },
  { sport_type: "Run", distance: 5000, start_date_local: "2026-09-16T07:00:00Z" },
], { period: "week", metric: "distance" });
ok(v.keys.join() === "2026-08-31,2026-09-07,2026-09-14", "continuous week keys");
ok(v.sports[0] === "Ride", "sports sorted by total");
ok(v.values.Run.join() === "10,0,5", "run km per week");
const m = volumeByPeriod([
  { sport_type: "Run", distance: 1000, start_date_local: "2025-11-03T07:00:00Z" },
  { sport_type: "Run", distance: 1000, start_date_local: "2026-02-03T07:00:00Z" },
], { period: "month", metric: "count" });
ok(m.keys.join() === "2025-11,2025-12,2026-01,2026-02", "month keys across year");

// weekly load range
const wl = weeklyLoad([{ day: "2026-09-01", load: 300 }, { day: "2026-09-08", load: 300 }, { day: "2026-09-15", load: 300 }, { day: "2026-09-22", load: 500 }], "2026-09-23", 4);
ok(wl.length === 4 && wl[3].week === "2026-09-21", "weekly load last week is current");
near(wl[3].low, 225, 0.01, "range low");
near(wl[3].high, 375, 0.01, "range high");

print(`${passed} passed, ${failed} failed`);
if (failed) throw new Error("tests failed");
