// GPX and TCX readers (browser DOMParser). Namespaces are ignored by
// matching local names, because exporters disagree on prefixes.
import { build, nameFromFile } from "../activity.js";
import { t } from "../i18n.js";

const kids = (el, name) => (el ? [...el.getElementsByTagNameNS("*", name)] : []);
const first = (el, name) => (el ? el.getElementsByTagNameNS("*", name)[0] || null : null);
const num = (el) => {
  if (!el) return null;
  const v = parseFloat(el.textContent);
  return Number.isFinite(v) ? v : null;
};
const time = (el) => {
  const ms = el ? Date.parse(el.textContent.trim()) : NaN;
  return Number.isFinite(ms) ? ms / 1000 : null;
};

function parse(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(t("err.xml"));
  return doc;
}

const GPX_SPORT = { running: "Run", run: "Run", cycling: "Ride", biking: "Ride", ride: "Ride", walking: "Walk", hiking: "Hike", swimming: "Swim", "9": "Run", "1": "Ride" };

export function fromGpx(text, fileName) {
  const doc = parse(text);
  const pts = kids(doc, "trkpt").map((p) => ({
    time: time(first(p, "time")),
    lat: parseFloat(p.getAttribute("lat")),
    lon: parseFloat(p.getAttribute("lon")),
    alt: num(first(p, "ele")),
    hr: num(first(p, "hr")),
    cad: num(first(p, "cad")),
    power: num(first(p, "power")) ?? num(first(p, "PowerInWatts")),
    temp: num(first(p, "atemp")),
    dist: null,
  }));
  if (!pts.length) throw new Error(t("err.noPoints"));
  const trk = first(doc, "trk");
  const type = (first(trk, "type")?.textContent || "").trim().toLowerCase();
  return build(pts, {
    name: first(trk, "name")?.textContent.trim() || nameFromFile(fileName),
    sport: GPX_SPORT[type] || null,
    source: "gpx",
    device: doc.documentElement.getAttribute("creator"),
  });
}

const TCX_SPORT = { Running: "Run", Biking: "Ride", Other: "Workout" };

export function fromTcx(text, fileName) {
  const doc = parse(text);
  const activity = first(doc, "Activity");
  const pts = kids(doc, "Trackpoint").map((p) => {
    const pos = first(p, "Position");
    return {
      time: time(first(p, "Time")),
      lat: num(first(pos, "LatitudeDegrees")),
      lon: num(first(pos, "LongitudeDegrees")),
      alt: num(first(p, "AltitudeMeters")),
      dist: num(first(p, "DistanceMeters")),
      hr: num(first(first(p, "HeartRateBpm"), "Value")),
      cad: num(first(p, "Cadence")) ?? num(first(p, "RunCadence")),
      power: num(first(p, "Watts")),
      temp: null,
    };
  });
  if (!pts.length) throw new Error(t("err.noPoints"));
  const creator = first(first(activity, "Creator"), "Name")?.textContent.trim();
  return build(pts, {
    name: nameFromFile(fileName),
    sport: TCX_SPORT[activity?.getAttribute("Sport")] || null,
    source: "tcx",
    device: creator || null,
  });
}
