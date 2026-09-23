// freeStrava token Worker (Cloudflare Workers, free plan).
//
// The only job of this Worker is to keep the Strava client secret off the
// frontend. It exchanges an OAuth code for tokens, refreshes tokens, and
// revokes access. It stores nothing and logs no tokens.
//
// Environment (set in the Cloudflare dashboard → Worker → Settings → Variables):
//   STRAVA_CLIENT_ID      plain variable, e.g. "123456"
//   STRAVA_CLIENT_SECRET  secret (encrypted)
//   ALLOWED_ORIGINS       comma-separated, e.g.
//                         "https://yourname.github.io,http://localhost:8000"

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_DEAUTH_URL = "https://www.strava.com/oauth/deauthorize";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = originOk
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };

    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    }
    if (!originOk) return json({ error: "origin_not_allowed" }, 403);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
      return json({ error: "worker_not_configured" }, 500);
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > 4096) return json({ error: "body_too_large" }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const isToken = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{8,512}$/.test(v);

    if (path === "/token") {
      if (!isToken(body.code)) return json({ error: "missing_code" }, 400);
      return forwardToStrava(STRAVA_TOKEN_URL, {
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        code: body.code,
        grant_type: "authorization_code",
      }, json);
    }

    if (path === "/refresh") {
      if (!isToken(body.refresh_token)) return json({ error: "missing_refresh_token" }, 400);
      return forwardToStrava(STRAVA_TOKEN_URL, {
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        refresh_token: body.refresh_token,
        grant_type: "refresh_token",
      }, json);
    }

    if (path === "/deauthorize") {
      if (!isToken(body.access_token)) return json({ error: "missing_access_token" }, 400);
      return forwardToStrava(STRAVA_DEAUTH_URL, { access_token: body.access_token }, json);
    }

    return json({ error: "not_found" }, 404);
  },
};

async function forwardToStrava(url, params, json) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
  } catch {
    return json({ error: "strava_unreachable" }, 502);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return json({ error: "strava_bad_response", status: res.status }, 502);
  }
  if (!res.ok) {
    return json({ error: "strava_error", status: res.status, message: data.message || null }, res.status);
  }
  // Pass through only what the frontend needs.
  const out = {};
  for (const k of ["access_token", "refresh_token", "expires_at", "token_type", "athlete"]) {
    if (k in data) out[k] = data[k];
  }
  if (out.athlete) {
    const a = out.athlete;
    out.athlete = {
      id: a.id,
      firstname: a.firstname,
      lastname: a.lastname,
      profile_medium: a.profile_medium,
      sex: a.sex,
    };
  }
  return json(out);
}
