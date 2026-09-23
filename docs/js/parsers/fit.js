// Minimal FIT (Garmin Flexible and Interoperable Data Transfer) decoder.
// Handles normal + compressed-timestamp headers, both byte orders, arrays,
// developer fields and chained files. Only the messages/fields we use are
// named; everything else is kept under its numeric id.
//
// Spec: https://developer.garmin.com/fit/protocol/

import { t } from "../i18n.js";

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z in Unix seconds

// base type id → [byteSize, reader name, invalid value]
const BASE = {
  0x00: [1, "u8", 0xff], 0x01: [1, "s8", 0x7f], 0x02: [1, "u8", 0xff],
  0x83: [2, "s16", 0x7fff], 0x84: [2, "u16", 0xffff],
  0x85: [4, "s32", 0x7fffffff], 0x86: [4, "u32", 0xffffffff],
  0x07: [1, "str", null], 0x88: [4, "f32", null], 0x89: [8, "f64", null],
  0x0a: [1, "u8", 0], 0x8b: [2, "u16", 0], 0x8c: [4, "u32", 0],
  0x0d: [1, "u8", null], 0x8e: [8, "s64", null], 0x8f: [8, "u64", null], 0x90: [8, "u64", 0n],
};

// Field names with [scale, offset]; value = raw / scale - offset.
// "time" marks FIT timestamps (converted to Unix seconds).
const PROFILE = {
  0: ["file_id", { 0: "type", 1: "manufacturer", 2: "product", 3: "serial_number", 4: ["time_created", "time"] }],
  12: ["sport", { 0: "sport", 1: "sub_sport", 3: "name" }],
  18: ["session", {
    253: ["timestamp", "time"], 2: ["start_time", "time"], 5: "sport", 6: "sub_sport",
    7: ["total_elapsed_time", 1000], 8: ["total_timer_time", 1000], 9: ["total_distance", 100],
    11: "total_calories", 14: ["avg_speed", 1000], 15: ["max_speed", 1000],
    16: "avg_heart_rate", 17: "max_heart_rate", 18: "avg_cadence", 19: "max_cadence",
    20: "avg_power", 21: "max_power", 22: "total_ascent", 23: "total_descent",
    124: ["enhanced_avg_speed", 1000], 125: ["enhanced_max_speed", 1000],
  }],
  19: ["lap", {
    253: ["timestamp", "time"], 2: ["start_time", "time"],
    7: ["total_elapsed_time", 1000], 8: ["total_timer_time", 1000], 9: ["total_distance", 100],
    13: ["avg_speed", 1000], 15: "avg_heart_rate", 16: "max_heart_rate", 17: "avg_cadence",
    19: "avg_power", 21: "total_ascent", 22: "total_descent", 24: "lap_trigger",
    110: ["enhanced_avg_speed", 1000],
  }],
  20: ["record", {
    253: ["timestamp", "time"], 0: ["position_lat", "semicircles"], 1: ["position_long", "semicircles"],
    2: ["altitude", 5, 500], 3: "heart_rate", 4: "cadence", 5: ["distance", 100],
    6: ["speed", 1000], 7: "power", 13: "temperature", 53: ["fractional_cadence", 128],
    73: ["enhanced_speed", 1000], 78: ["enhanced_altitude", 5, 500],
    39: ["vertical_oscillation", 10], 41: ["stance_time", 10], 83: ["vertical_ratio", 100],
    85: ["step_length", 10],
  }],
  21: ["event", { 253: ["timestamp", "time"], 0: "event", 1: "event_type", 3: "data" }],
  23: ["device_info", { 253: ["timestamp", "time"], 0: "device_index", 1: "device_type", 2: "manufacturer", 4: "product", 27: "product_name" }],
  34: ["activity", { 253: ["timestamp", "time"], 5: ["local_timestamp", "time"] }],
  78: ["hrv", { 0: ["time", 1000] }],
  206: ["field_description", { 0: "developer_data_index", 1: "field_definition_number", 2: "fit_base_type_id", 3: "field_name", 8: "units" }],
};

export class FitError extends Error {}

/** @param {ArrayBuffer|Uint8Array} input  @returns {{messages: Object<string, object[]>}} */
export function decodeFit(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messages = {};
  let pos = 0;

  while (pos + 12 <= bytes.length) {
    const headerSize = bytes[pos];
    if (headerSize < 12) throw new FitError(t("err.notFit"));
    const dataSize = view.getUint32(pos + 4, true);
    const sig = String.fromCharCode(bytes[pos + 8], bytes[pos + 9], bytes[pos + 10], bytes[pos + 11]);
    if (sig !== ".FIT") throw new FitError(t("err.notFit"));
    const end = Math.min(pos + headerSize + dataSize, bytes.length);
    decodeChunk(bytes, view, pos + headerSize, end, messages);
    pos = end + 2; // skip file CRC; chained files may follow
  }
  if (!Object.keys(messages).length) throw new FitError(t("err.noRecords"));
  return { messages };
}

function decodeChunk(bytes, view, start, end, messages) {
  const defs = [];      // local message type → definition
  const devFields = {}; // `${devIndex}:${fieldNum}` → {name, units, base}
  let lastTs = 0;
  let pos = start;

  const read = (type, p, little) => {
    switch (type) {
      case "u8": return view.getUint8(p);
      case "s8": return view.getInt8(p);
      case "u16": return view.getUint16(p, little);
      case "s16": return view.getInt16(p, little);
      case "u32": return view.getUint32(p, little);
      case "s32": return view.getInt32(p, little);
      case "f32": return view.getFloat32(p, little);
      case "f64": return view.getFloat64(p, little);
      case "s64": return view.getBigInt64(p, little);
      case "u64": return view.getBigUint64(p, little);
    }
  };

  const readValue = (baseId, size, p, little) => {
    const [bsize, type, invalid] = BASE[baseId] || BASE[0x0d];
    if (type === "str") {
      let s = "";
      for (let i = 0; i < size && bytes[p + i] !== 0; i++) s += String.fromCharCode(bytes[p + i]);
      try { s = decodeURIComponent(escape(s)); } catch { /* not UTF-8, keep raw */ }
      return s || null;
    }
    const n = Math.max(1, Math.floor(size / bsize));
    const vals = [];
    for (let i = 0; i < n; i++) {
      const v = read(type, p + i * bsize, little);
      const bad = invalid !== null && v === invalid || (type === "f32" || type === "f64") && !Number.isFinite(v);
      vals.push(bad ? null : typeof v === "bigint" ? Number(v) : v);
    }
    return n === 1 ? vals[0] : vals.every((v) => v === null) ? null : vals;
  };

  while (pos < end) {
    const h = bytes[pos++];
    if (h & 0x80) {
      // Compressed timestamp header
      const local = (h >> 5) & 0x03;
      const offset = h & 0x1f;
      let ts = (lastTs & ~0x1f) + offset;
      if (offset < (lastTs & 0x1f)) ts += 0x20;
      lastTs = ts;
      pos = readData(defs[local], pos, ts);
    } else if (h & 0x40) {
      // Definition message
      const local = h & 0x0f;
      const hasDev = (h & 0x20) !== 0;
      const little = bytes[pos + 1] === 0;
      const global = view.getUint16(pos + 2, little);
      const nFields = bytes[pos + 4];
      pos += 5;
      const fields = [];
      for (let i = 0; i < nFields; i++, pos += 3) fields.push({ num: bytes[pos], size: bytes[pos + 1], base: bytes[pos + 2] });
      const dev = [];
      if (hasDev) {
        const nDev = bytes[pos++];
        for (let i = 0; i < nDev; i++, pos += 3) dev.push({ num: bytes[pos], size: bytes[pos + 1], index: bytes[pos + 2] });
      }
      defs[local] = { global, little, fields, dev };
    } else {
      pos = readData(defs[h & 0x0f], pos, null);
    }
  }

  function readData(def, p, compressedTs) {
    if (!def) throw new FitError(t("err.corruptFit"));
    const [name, profile] = PROFILE[def.global] || [String(def.global), {}];
    const msg = {};
    for (const f of def.fields) {
      const raw = readValue(f.base, f.size, p, def.little);
      p += f.size;
      if (raw === null) continue;
      const spec = profile[f.num];
      if (!spec) { msg[f.num] = raw; continue; }
      const [fname, scale = 1, offset = 0] = typeof spec === "string" ? [spec] : spec;
      if (f.num === 253 && typeof raw === "number") lastTs = raw;
      msg[fname] = convert(raw, scale, offset);
    }
    for (const f of def.dev) {
      const info = devFields[`${f.index}:${f.num}`];
      const raw = readValue(info ? info.base : 0x0d, f.size, p, def.little);
      p += f.size;
      if (raw !== null) (msg.dev ||= {})[info?.name || `dev_${f.index}_${f.num}`] = raw;
    }
    if (compressedTs !== null && msg.timestamp === undefined) msg.timestamp = compressedTs + FIT_EPOCH;
    if (name === "field_description" && msg.field_name) {
      devFields[`${msg.developer_data_index}:${msg.field_definition_number}`] = {
        name: msg.field_name, units: msg.units, base: msg.fit_base_type_id,
      };
    }
    (messages[name] ||= []).push(msg);
    return p;
  }
}

function convert(raw, scale, offset) {
  const one = (v) => {
    if (v === null) return null;
    if (scale === "time") return v + FIT_EPOCH;
    if (scale === "semicircles") return v * (180 / 2147483648);
    return scale === 1 && offset === 0 ? v : v / scale - offset;
  };
  return Array.isArray(raw) ? raw.map(one) : one(raw);
}

// FIT sport enum → Strava-style sport name
const SPORTS = {
  0: "Workout", 1: "Run", 2: "Ride", 4: "Workout", 5: "Swim", 10: "Workout", 11: "Walk",
  12: "NordicSki", 13: "AlpineSki", 15: "Rowing", 17: "Hike", 19: "StandUpPaddling",
  37: "Kayaking", 41: "Kayaking",
};
export function fitSportName(sport, subSport) {
  if (sport === 1 && subSport === 1) return "VirtualRun";   // treadmill
  if (sport === 1 && subSport === 3) return "TrailRun";
  if (sport === 2 && (subSport === 6 || subSport === 58)) return "VirtualRide";
  if (sport === 2 && subSport === 8) return "MountainBikeRide";
  if (sport === 2 && subSport === 46) return "GravelRide";
  return SPORTS[sport] || "Workout";
}
