// OAuth: redirect to Strava, exchange the code via the Worker, keep tokens
// in this browser's localStorage, refresh them when they expire.
import { CONFIG, REDIRECT_URI } from "./config.js";

const TOKEN_KEY = "freestrava.auth";
const STATE_KEY = "freestrava.oauthState";

function load() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
}
function save(auth) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
}

export function currentAuth() {
  return load();
}

export function startLogin() {
  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  localStorage.setItem(STATE_KEY, state);
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: CONFIG.STRAVA_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: CONFIG.SCOPE,
    state,
  });
  location.assign(url.toString());
}

async function callWorker(path, body) {
  const res = await fetch(CONFIG.WORKER_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Login server error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * If the page was opened by Strava's redirect, finish the login.
 * Returns the auth object, null if this isn't a redirect, or throws a
 * user-readable Error.
 */
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("error")) return null;
  // Clean the URL right away so a reload doesn't reuse the one-time code.
  history.replaceState(null, "", REDIRECT_URI);

  if (params.get("error")) {
    throw new Error("You cancelled the Strava login. Tap “Connect with Strava” to try again.");
  }
  const expected = localStorage.getItem(STATE_KEY);
  localStorage.removeItem(STATE_KEY);
  if (!expected || params.get("state") !== expected) {
    throw new Error(
      "Login couldn’t be verified. If you opened this link inside WhatsApp, " +
      "open it in Safari or Chrome instead and try again."
    );
  }
  const granted = (params.get("scope") || "").split(",");
  if (!granted.includes("activity:read_all") && !granted.includes("activity:read")) {
    throw new Error(
      "Strava didn’t share your activities. Please connect again and leave the " +
      "“View data about your activities” box ticked."
    );
  }
  const data = await callWorker("/token", { code: params.get("code") });
  const auth = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
    scope: granted,
  };
  save(auth);
  return auth;
}

/** A valid access token, refreshing it first if it's about to expire. */
export async function getAccessToken() {
  const auth = load();
  if (!auth) throw new Error("Not connected");
  if (auth.expires_at - 120 > Date.now() / 1000) return auth.access_token;
  let data;
  try {
    data = await callWorker("/refresh", { refresh_token: auth.refresh_token });
  } catch (e) {
    // 400/401 from Strava = refresh token revoked/invalid: the user must log in again.
    if (e.status === 400 || e.status === 401) {
      const err = new Error("Your Strava connection expired. Please connect again.");
      err.status = 401;
      throw err;
    }
    throw e;
  }
  auth.access_token = data.access_token;
  auth.refresh_token = data.refresh_token;
  auth.expires_at = data.expires_at;
  save(auth);
  return auth.access_token;
}

/** Revoke the app's access on Strava and forget the tokens locally. */
export async function logout({ revoke = true } = {}) {
  const auth = load();
  localStorage.removeItem(TOKEN_KEY);
  if (revoke && auth) {
    try { await callWorker("/deauthorize", { access_token: auth.access_token }); } catch { /* best effort */ }
  }
}
