// Turns a parsed file (FIT / GPX / TCX) into one common shape:
//
// {
//   name, sport, start (unix s, UTC), tzOffset (s), device, source,
//   n,                          number of samples
//   t[]    seconds since start
//   dist[] metres (monotonic, filled)
//   lat[], lon[]                degrees or null
//   alt[]  metres or null       hr[] bpm or null      cad[] steps|rev/min or null
//   power[] watts or null       temp[] °C or null
//   timerOn[] 1/0               was the recording timer running (auto-pause aware)
//   totals: { ascent, timerTime, elapsedTime } from the device, when present
// }
import { fitSportName } from "./parsers/fit.js";

const EARTH_R = 6371008.8;

export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Pretty activity name from a file name like "Evening_Run.fit". */
export function nameFromFile(fileName) {
  const base = (fileName || "").replace(/\.(fit|gpx|tcx)(\.gz)?$/i, "").replace(/[_]+/g, " ").trim();
  return /^\d+$/.test(base) || !base ? null : base;
}

const MANUFACTURERS = {
  1: "Garmin", 23: "Suunto", 32: "Wahoo", 123: "Polar", 255: "Development", 260: "Zwift",
  265: "Strava app", 289: "Hammerhead", 294: "Coros", 307: "Huawei", 310: "Apple",
};

export function fromFit(messages, fileName) {
  const records = messages.record || [];
  if (!records.length) throw new Error("This file has no recorded data points.");

  // Several apps (incl. Strava) write GPS, distance and HR as separate record
  // messages with the same timestamp — merge them.
  const byTs = new Map();
  for (const r of records) {
    if (r.timestamp == null) continue;
    const m = byTs.get(r.timestamp);
    if (m) Object.assign(m, r); else byTs.set(r.timestamp, { ...r });
  }
  const ts = [...byTs.keys()].sort((a, b) => a - b);
  const session = (messages.session || [])[0] || {};
  const start = session.start_time ?? ts[0];

  const pts = ts.map((k) => {
    const r = byTs.get(k);
    const cad = r.cadence != null ? r.cadence + (r.fractional_cadence || 0) : null;
    return {
      time: k,
      lat: r.position_lat ?? null,
      lon: r.position_long ?? null,
      alt: r.enhanced_altitude ?? r.altitude ?? null,
      dist: r.distance ?? null,
      hr: r.heart_rate || null,
      cad,
      power: r.power ?? null,
      temp: r.temperature ?? null,
    };
  });

  // Timer state from start/stop events (event 0 = timer; type 0 start, 1 stop, 4 stop all).
  const timerEvents = (messages.event || [])
    .filter((e) => e.event === 0 && e.timestamp != null && [0, 1, 4].includes(e.event_type))
    .map((e) => ({ time: e.timestamp, on: e.event_type === 0 }))
    .sort((a, b) => a.time - b.time);

  const act = (messages.activity || [])[0];
  let tzOffset = null;
  if (act?.local_timestamp && act.timestamp) {
    tzOffset = Math.round((act.local_timestamp - act.timestamp) / 900) * 900;
  }

  const dev = (messages.device_info || []).find((d) => d.dev?.device_model || d.manufacturer);
  const fileId = (messages.file_id || [])[0] || {};
  const maker = MANUFACTURERS[fileId.manufacturer] || null;
  let device = maker;
  if (dev?.dev?.device_model) device = `${maker || "App"} (${dev.dev.device_model.replace(/\d+,\d+$/, "")})`;
  else if (dev?.product_name) device = dev.product_name;

  const sport = session.dev?.activity_type || fitSportName(session.sport, session.sub_sport);

  return build(pts, {
    name: nameFromFile(fileName),
    sport,
    start,
    tzOffset,
    device,
    source: "fit",
    timerEvents,
    totals: {
      ascent: session.total_ascent ?? null,
      timerTime: session.total_timer_time ?? null,
      elapsedTime: session.total_elapsed_time ?? null,
    },
  });
}

/**
 * Shared builder for all formats.
 * pts: [{time (unix s), lat, lon, alt, dist, hr, cad, power, temp}]
 */
export function build(pts, meta) {
  pts = pts.filter((p) => p.time != null).sort((a, b) => a.time - b.time);
  if (pts.length < 2) throw new Error("This file has too few data points to analyse.");
  const n = pts.length;
  const start = meta.start ?? pts[0].time;
  const col = (k) => pts.map((p) => (p[k] == null || Number.isNaN(p[k]) ? null : p[k]));

  const t = pts.map((p) => p.time - start);
  const lat = col("lat"), lon = col("lon");
  const hr = col("hr"), cad = col("cad"), power = col("power"), temp = col("temp");
  let alt = col("alt");
  let dist = col("dist");

  // Distance: use the device's if present, else integrate GPS.
  if (dist.every((d) => d == null || d === 0) && lat.some((v) => v != null)) {
    dist = new Array(n).fill(0);
    let pl = null, po = null;
    for (let i = 0; i < n; i++) {
      if (lat[i] != null && lon[i] != null) {
        if (pl != null) dist[i] = haversine(pl, po, lat[i], lon[i]);
        pl = lat[i]; po = lon[i];
      }
      if (i) dist[i] += dist[i - 1];
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) {
      if (dist[i] == null || dist[i] < last) dist[i] = last;
      last = dist[i];
    }
  }

  // Short gaps in sensor data: carry the last value forward for up to 10 s.
  fillForward(hr, t, 10);
  fillForward(cad, t, 10);
  fillForward(power, t, 5);
  if (alt.some((v) => v != null)) {
    fillForward(alt, t, Infinity);
    const first = alt.find((v) => v != null);
    alt = alt.map((v) => v ?? first);
  } else {
    alt = null;
  }

  // Timer: replay start/stop events; without events it always runs.
  const timerOn = new Array(n).fill(1);
  const ev = meta.timerEvents || [];
  if (ev.length) {
    let on = true, e = 0;
    for (let i = 0; i < n; i++) {
      while (e < ev.length && ev[e].time <= pts[i].time) on = ev[e++].on;
      timerOn[i] = on ? 1 : 0;
    }
  }

  const any = (arr) => arr && arr.some((v) => v != null);
  return {
    name: meta.name,
    sport: meta.sport || "Workout",
    start,
    tzOffset: meta.tzOffset ?? -new Date(start * 1000).getTimezoneOffset() * 60,
    device: meta.device || null,
    source: meta.source,
    n,
    t, dist,
    lat: any(lat) ? lat : null,
    lon: any(lon) ? lon : null,
    alt,
    hr: any(hr) ? hr : null,
    cad: any(cad) ? cad : null,
    power: any(power) ? power : null,
    temp: any(temp) ? temp : null,
    timerOn,
    totals: meta.totals || {},
  };
}

function fillForward(arr, t, maxGap) {
  let last = null, lastT = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] != null) { last = arr[i]; lastT = t[i]; }
    else if (last != null && t[i] - lastT <= maxGap) arr[i] = last;
  }
}

/** Local "YYYY-MM-DDTHH:MM:SSZ" in Strava's start_date_local style (local time, fake Z). */
export function localIso(act) {
  return new Date((act.start + act.tzOffset) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
