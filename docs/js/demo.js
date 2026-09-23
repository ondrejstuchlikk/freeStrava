// Synthetic data for the demo — lets anyone preview the app without a file.
import { build } from "./activity.js";

/** A ~7.6 km run: 4 laps of a hilly park loop, with a 1-minute pause. */
export function demoActivity() {
  const now = new Date();
  const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 16, 30) / 1000);
  const c = { lat: 50.1052, lon: 14.4235 }, rx = 380, ry = 260; // metres
  const mLat = 111320, mLon = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const lapLen = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  const pts = [], events = [];
  let d = 0, hr = 95, t = 0, seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let paused = 0;
  while (d < lapLen * 4) {
    const theta = (d / lapLen) * 2 * Math.PI;
    const alt = 205 + 11 * Math.sin(theta) + 4 * Math.sin(3 * theta);
    const grade = (11 * Math.cos(theta) + 12 * Math.cos(3 * theta)) * (2 * Math.PI / lapLen);
    if (!paused && d > 3500) { paused = 60; events.push({ time: start + t, on: false }); }
    let v = 0;
    if (paused > 0) {
      paused--;
      if (paused === 0) { paused = -1; events.push({ time: start + t + 1, on: true }); }
    } else {
      const lap = Math.floor(d / lapLen);
      v = 3.05 + 0.12 * lap - 6 * grade + 0.15 * (rnd() - 0.5);
    }
    d += v;
    const target = v ? 118 + 22 * (v - 2.6) + 260 * Math.max(0, grade) + t / 240 : 100;
    hr += (target - hr) * 0.04;
    const jitter = () => (rnd() - 0.5) * 3e-5;
    pts.push({
      time: start + t,
      lat: c.lat + (ry * Math.sin(theta)) / mLat + jitter(),
      lon: c.lon + (rx * Math.cos(theta)) / mLon + jitter(),
      alt: alt + (rnd() - 0.5) * 0.6,
      dist: d,
      hr: Math.round(hr + (rnd() - 0.5) * 2),
      cad: v ? 84 + Math.round(v * 2) : null,
      power: null, temp: 17,
    });
    t++;
  }
  return build(pts, {
    name: "Evening Run (demo)", sport: "Run", source: "fit", device: "Demo watch",
    timerEvents: events, totals: {}, tzOffset: 7200,
  });
}

/** ~18 months of made-up activity summaries for the fitness/trend views. */
export function demoHistory(days = 540) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  const now = new Date();
  let id = 1;
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - i, 7));
    const dow = d.getUTCDay();
    const build = 0.6 + 0.4 * Math.sin(i / 40); // training blocks
    const plan = [
      dow === 1 || dow === 3 ? "Run" : null,
      dow === 6 ? "Ride" : null,
      dow === 0 ? "Run" : null,
      dow === 4 && rnd() < 0.5 ? "Swim" : null,
      dow === 2 && rnd() < 0.3 ? "WeightTraining" : null,
      dow === 5 && rnd() < 0.2 ? "Hike" : null,
    ].filter(Boolean);
    for (const sport of plan) {
      if (rnd() < 0.15) continue; // skipped workout
      const long = dow === 0 || dow === 6;
      const minutes = (sport === "Ride" ? 90 : sport === "Hike" ? 150 : long ? 75 : 45) * (0.7 + 0.5 * build * rnd() + 0.2);
      const speed = { Run: 2.9 + 0.4 * build + 0.2 * rnd(), Ride: 7 + 1.5 * build, Swim: 0.9, Hike: 1.2, WeightTraining: 0 }[sport];
      const hr = { Run: 140 + 15 * build * rnd() + (long ? 0 : 5), Ride: 132 + 12 * rnd(), Swim: 130, Hike: 115, WeightTraining: 110 }[sport];
      const noHr = rnd() < 0.1;
      const sec = Math.round(minutes * 60);
      const iso = d.toISOString().replace(".000", "");
      out.push({
        id: id++,
        name: `${long ? "Long " : ""}${sport === "WeightTraining" ? "Gym" : sport.toLowerCase()} ${long ? "" : "session"}`.trim(),
        sport_type: sport,
        type: sport,
        start_date: iso,
        start_date_local: iso,
        distance: Math.round(speed * sec),
        moving_time: sec,
        elapsed_time: Math.round(sec * 1.08),
        total_elevation_gain: sport === "Hike" ? 600 : sport === "Ride" ? 400 * rnd() + 200 : 60 * rnd(),
        average_speed: speed,
        has_heartrate: !noHr,
        average_heartrate: noHr ? undefined : Math.round(hr),
        max_heartrate: noHr ? undefined : Math.round(hr + 20 + 10 * rnd()),
        suffer_score: noHr ? null : Math.round((sec / 60) * ((hr - 100) / 50) ** 2 * 1.2),
        kudos_count: Math.floor(rnd() * 12),
      });
    }
  }
  return out;
}
