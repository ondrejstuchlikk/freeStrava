// Synthetic activities with known answers. Run: ./tests/run.sh
import { build } from "../docs/js/activity.js";
import { analyze, gradeFactor } from "../docs/js/analysis.js";
import { decodeFit } from "../docs/js/parsers/fit.js";

let failed = 0, passed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; print("FAIL: " + msg); } }
function near(a, b, tol, msg) { ok(a != null && Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`); }
const S = { maxHr: 190, restHr: 50, trimpK: 1.92, thresholdPace: 300, ftp: 250 };

// Flat run: 3 m/s for 3000 s, HR 150, with a 60 s timer pause at t=1000.
const pts = [];
for (let t = 0; t <= 3060; t++) {
  const paused = t > 1000 && t <= 1060;
  const moved = t <= 1000 ? t : paused ? 1000 : t - 60;
  pts.push({ time: 1_700_000_000 + t, dist: moved * 3, alt: 100, hr: 150, lat: null, lon: null, cad: 85, power: null, temp: null });
}
const events = [{ time: 1_700_000_000 + 1000, on: false }, { time: 1_700_000_000 + 1060, on: true }];
const act = build(pts, { sport: "Run", source: "fit", timerEvents: events, totals: {} });
const r = analyze(act, S);
near(r.summary.distance, 9000, 0.01, "distance");
near(r.summary.movingTime, 3000, 2, "moving time excludes pause");
near(r.summary.elapsedTime, 3060, 0.01, "elapsed time");
near(r.summary.avgSpeed, 3, 0.01, "avg speed");
near(r.summary.avgGapSpeed, 3, 0.01, "flat GAP = pace");
ok(r.splits.length === 9, "9 full km splits");
near(r.splits[0].time, 333.3, 1, "split time");
near(r.splits[4].hr, 150, 0.01, "split HR");
const be = Object.fromEntries(r.bestEfforts.map((b) => [b.name, b.sec]));
near(be["1 km"], 333.3, 1, "best 1 km");
near(be["5 km"], 1666.7, 2, "best 5 km across the pause");
ok(!("10 km" in be), "no 10 km effort in 9 km run");
near(r.summary.avgCad, 170, 0.01, "FIT run cadence doubled to steps/min");
near(r.summary.decoupling, 0, 0.5, "no decoupling at steady HR/pace");
ok(r.summary.pauses.length === 1 && Math.abs(r.summary.pauses[0].sec - 60) <= 2, "one 60 s pause");
const hrr = (150 - 50) / 140;
near(r.summary.load, (50 * hrr * 0.64 * Math.exp(1.92 * hrr)) / (60 * 0.85 * 0.64 * Math.exp(1.92 * 0.85)) * 100, 1, "HR load");
ok(r.zones.hr[2].sec > 2990, "HR 150/190 = 79% of max = Z3");
ok(r.zones.pace.find((z) => z.name.startsWith("Z3")).sec > 2990, "3 m/s = 90% of 3.33 m/s threshold = Z3 pace");

// Grade-adjusted pace
near(gradeFactor(0), 1, 1e-9, "flat factor 1");
ok(gradeFactor(0.1) > 1.3 && gradeFactor(0.1) < 1.6, "10% uphill ≈ 1.3–1.6× effort");
ok(gradeFactor(-0.03) > 0.88 && gradeFactor(-0.03) < 1, "gentle downhill a bit easier");
ok(gradeFactor(-0.25) > gradeFactor(-0.1), "steep downhill harder than moderate downhill");

// Ride with power, no timer events, stop detection by speed
const ride = [];
for (let t = 0; t <= 3600; t++) {
  const stopped = t >= 1800 && t < 1900;
  ride.push({ time: 1_700_000_000 + t, dist: (t < 1800 ? t : t < 1900 ? 1800 : t - 100) * 8, alt: null, hr: null, lat: null, lon: null, cad: null, power: stopped ? 0 : 200, temp: null });
}
const rr = analyze(build(ride, { sport: "Ride", source: "fit" }), S);
near(rr.summary.movingTime, 3500, 10, "ride stop detected by speed");
near(rr.summary.np, 200, 1, "normalized power of steady ride");
ok(rr.summary.loadMethod === "power", "power load when FTP set");
near(rr.powerCurve.find((p) => p.sec === 1200).watts, 200, 0.01, "20 min power");

// FIT decoder: hand-built minimal file (one definition + one record)
const body = [
  0x40, 0, 0, 20, 0, 3, 253, 4, 0x86, 3, 1, 0x02, 5, 4, 0x86, // definition: record(timestamp, hr, distance)
  0x00, 0x10, 0x27, 0, 0, 150, 0xe8, 0x03, 0, 0,               // data: ts=10000, hr=150, dist=1000 (10.00 m)
];
const header = [14, 0x20, 0, 0, body.length, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54, 0, 0];
const fit = decodeFit(new Uint8Array([...header, ...body, 0, 0]));
const rec = fit.messages.record[0];
ok(rec.heart_rate === 150 && rec.distance === 10 && rec.timestamp === 10000 + 631065600, "FIT decode record");

print(`${passed} passed, ${failed} failed`);
if (failed) throw new Error("tests failed");
