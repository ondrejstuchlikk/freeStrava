// Strava API client (runs in the browser; Strava allows CORS).
//
// Rate limits are per *application*, shared by everyone using this site:
// 100 read requests / 15 min and 1,000 / day (check developers.strava.com).
// The 15-minute window resets at :00, :15, :30, :45; the daily one at
// midnight UTC. We read the usage headers, pause before hitting the limit,
// and wait out 429s with a countdown.
import { getAccessToken } from "./auth.js";

const API = "https://www.strava.com/api/v3";
const PAGE_SIZE = 200; // Strava maximum
const SAFETY_MARGIN = 3; // leave a few requests for other users of the app

export class DailyLimitError extends Error {
  constructor() {
    const reset = new Date();
    reset.setUTCHours(24, 0, 0, 0);
    const at = reset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    super(`Strava’s daily request limit for this app is used up. Your data so far is saved — come back after ${at} to continue.`);
  }
}

// Usage headers are only readable if Strava exposes them via CORS, which it
// may not. So we also count our own requests per window; that undercounts
// (other users share the limit), and a 429 is the authoritative signal.
export const rateState = { shortUsed: 0, shortLimit: 100, dayUsed: 0, dayLimit: 1000, window: null, day: null };

function tick() {
  const now = new Date();
  const win = Math.floor(now.getTime() / 900000);
  const day = now.toISOString().slice(0, 10);
  if (rateState.window !== win) { rateState.window = win; rateState.shortUsed = 0; }
  if (rateState.day !== day) { rateState.day = day; rateState.dayUsed = 0; }
}

function readHeaders(res) {
  const usage = res.headers.get("X-ReadRateLimit-Usage") || res.headers.get("X-RateLimit-Usage");
  const limit = res.headers.get("X-ReadRateLimit-Limit") || res.headers.get("X-RateLimit-Limit");
  if (usage && limit) {
    const [su, du] = usage.split(",").map(Number);
    const [sl, dl] = limit.split(",").map(Number);
    Object.assign(rateState, { shortUsed: su, dayUsed: du, shortLimit: sl, dayLimit: dl });
  } else {
    rateState.shortUsed++;
    rateState.dayUsed++;
  }
}

/** Milliseconds until the next quarter-hour window starts (+ small buffer). */
function msToNextWindow() {
  return 900000 - (Date.now() % 900000) + 5000;
}

async function waitWithCountdown(ms, onWait, signal) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onWait?.(Math.ceil((end - Date.now()) / 1000));
    await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
  }
  onWait?.(0);
}

/**
 * GET an API path with rate-limit handling.
 * onWait(secondsLeft) is called while pausing for the limit to reset.
 */
export async function apiGet(path, params = {}, { onWait, signal } = {}) {
  let throttled = 0;
  for (;;) {
    tick();
    if (rateState.dayUsed >= rateState.dayLimit - SAFETY_MARGIN) throw new DailyLimitError();
    if (rateState.shortUsed >= rateState.shortLimit - SAFETY_MARGIN) {
      await waitWithCountdown(msToNextWindow(), onWait, signal);
      tick();
    }

    const token = await getAccessToken();
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    readHeaders(res);

    if (res.status === 429) {
      // A 429 right after a fresh 15-minute window means the daily limit is hit.
      if (throttled >= 1 || rateState.dayUsed >= rateState.dayLimit) throw new DailyLimitError();
      throttled++;
      await waitWithCountdown(msToNextWindow(), onWait, signal);
      continue;
    }
    if (res.status === 401) {
      const err = new Error("Strava access was revoked or expired. Please connect again.");
      err.status = 401;
      throw err;
    }
    if (!res.ok) throw new Error(`Strava error ${res.status}`);
    return res.json();
  }
}

/**
 * Fetch activity summaries starting after `after` (epoch seconds; 0 = all).
 * With `after` set Strava returns oldest first, so an interrupted sync can
 * resume from the newest activity already saved. Calls onPage(batch,
 * totalSoFar) after each page so the caller can save progress.
 */
export async function fetchActivities({ after = 0, onPage, onWait, signal } = {}) {
  let page = 1, total = 0;
  for (;;) {
    const batch = await apiGet("/athlete/activities", { per_page: PAGE_SIZE, page, after }, { onWait, signal });
    total += batch.length;
    await onPage?.(batch, total);
    if (batch.length < PAGE_SIZE) return total;
    page++;
  }
}
