// Detects the file type and returns a normalized activity (see activity.js).
import { decodeFit } from "./fit.js";
import { fromGpx, fromTcx } from "./xml.js";
import { fromFit } from "../activity.js";

async function gunzip(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can’t open .gz files. Please update it or unzip the file first.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {File|{name:string, arrayBuffer():Promise<ArrayBuffer>}} file */
export async function readActivityFile(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  let name = file.name || "";
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = await gunzip(bytes);
    name = name.replace(/\.gz$/i, "");
  }
  const isFit = bytes.length > 12 && String.fromCharCode(...bytes.slice(8, 12)) === ".FIT";
  if (isFit) return fromFit(decodeFit(bytes).messages, name);

  const text = new TextDecoder().decode(bytes);
  const head = text.slice(0, 2000);
  if (/<gpx[\s>]/i.test(head)) return fromGpx(text, name);
  if (/<TrainingCenterDatabase[\s>]/i.test(head)) return fromTcx(text, name);
  if (/^PK/.test(head)) throw new Error("That’s a ZIP file. Please pick a single activity file (.fit, .gpx or .tcx).");
  if (/<html/i.test(head)) {
    throw new Error("That file is a web page, not an activity. You probably weren’t logged in to strava.com when downloading — log in and try the download again.");
  }
  throw new Error("Unknown file type. Please pick a .fit, .gpx or .tcx file exported from Strava.");
}
