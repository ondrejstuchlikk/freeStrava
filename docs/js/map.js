// Route map (Leaflet + OpenStreetMap tiles, loaded from CDN in index.html).
// The route is coloured by a single-hue ramp (light = low, dark = high).
import { t } from "./i18n.js";

const RAMP = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

let map = null, layer = null, marker = null, track = null;

export function drawMap(el, points, mode) {
  if (!window.L) { el.textContent = t("map.failed"); return null; }
  if (!map || map.getContainer() !== el) {
    map?.remove();
    map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
  }
  track = points;
  layer?.remove();
  layer = L.featureGroup().addTo(map);

  const value = (p) => (mode === "hr" ? p.hr : mode === "grade" ? p.grade : p.speed);
  const vals = points.map(value).filter((v) => v != null).sort((a, b) => a - b);
  // 5th–95th percentile so a GPS spike doesn't flatten the colours.
  const lo = vals[Math.floor(vals.length * 0.05)] ?? 0;
  const hi = vals[Math.floor(vals.length * 0.95)] ?? 1;
  const colorOf = (v) => {
    if (v == null || hi <= lo) return "#9a9892";
    const f = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    return RAMP[Math.round(f * (RAMP.length - 1))];
  };

  // Group consecutive points of the same colour into one polyline.
  let seg = [], segColor = null;
  const flush = () => {
    if (seg.length > 1) L.polyline(seg, { color: segColor, weight: 4, opacity: 0.95, lineCap: "round" }).addTo(layer);
  };
  for (const p of points) {
    const c = colorOf(value(p));
    if (c !== segColor && seg.length) { seg.push([p.lat, p.lon]); flush(); seg = [seg.at(-1)]; }
    segColor = c;
    seg.push([p.lat, p.lon]);
  }
  flush();

  const start = points[0], end = points.at(-1);
  L.circleMarker([end.lat, end.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#0b0b0b", fillOpacity: 1 }).addTo(layer).bindTooltip("Finish");
  L.circleMarker([start.lat, start.lon], { radius: 6, color: "#0b0b0b", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(layer).bindTooltip("Start");
  marker = L.circleMarker([start.lat, start.lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#eb6834", fillOpacity: 1, opacity: 0 }).addTo(layer);
  marker.setStyle({ fillOpacity: 0 });

  map.fitBounds(layer.getBounds(), { padding: [16, 16] });
  setTimeout(() => map.invalidateSize(), 0);
  return { lo, hi, ramp: RAMP };
}

/** Move the hover marker to the point nearest `km` (null hides it). */
export function mapHover(km) {
  if (!marker || !track) return;
  if (km == null) { marker.setStyle({ opacity: 0, fillOpacity: 0 }); return; }
  let lo = 0, hi = track.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (track[mid].km < km) lo = mid + 1; else hi = mid; }
  const p = track[lo];
  marker.setLatLng([p.lat, p.lon]).setStyle({ opacity: 1, fillOpacity: 1 });
}

export function destroyMap() {
  map?.remove();
  map = layer = marker = track = null;
}
