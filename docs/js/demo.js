// Synthetic activities for ?demo — lets anyone preview the app without a
// Strava account (and lets us test the UI without spending API requests).

export function demoActivities(days = 540) {
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
