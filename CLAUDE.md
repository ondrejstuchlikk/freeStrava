# freeStrava — project context

Web app that shows a Strava user the stats Strava normally puts behind its paid
subscription, computed from free API data. Built for the owner's
**non-technical friends**: they open a link (shared via WhatsApp, often on a
phone), tap "Connect with Strava", log in, and see their stats.

## Architecture (decided — don't re-litigate)

1. **Static frontend** in `docs/`: plain HTML/CSS/vanilla JS ES modules, no
   build step, no npm. Served by **GitHub Pages** (branch `main`, folder `/docs`).
   Chart.js 4 comes from jsDelivr, pinned with an SRI hash.
2. **Cloudflare Worker** in `worker/worker.js`: ONLY does the OAuth code→token
   exchange, token refresh and deauthorize, because the Strava client secret
   must never reach the frontend. Secret = Worker secret `STRAVA_CLIENT_SECRET`;
   also `STRAVA_CLIENT_ID` and `ALLOWED_ORIGINS` (CORS allow-list). Stores and
   logs nothing.
3. **Everything else runs in the browser**: the browser calls the Strava API
   directly (Strava sends `Access-Control-Allow-Origin: *`), caches activities
   in IndexedDB (one DB per athlete: `freestrava-<athleteId>`), computes stats.
   Tokens live in the user's localStorage. No database or server-side storage.
4. **Free tiers only**: GitHub Pages, Cloudflare Workers free plan, Strava API.

## Strava API constraints that shape the design

- Rate limits are **per application, shared by all users**: read endpoints
  100 requests/15 min and 1,000/day (overall 200/2,000). Windows reset at
  :00/:15/:30/:45 and at midnight UTC. So the MVP uses **only**
  `GET /athlete/activities` (200 per page → ~5 requests for 1,000 activities)
  and syncs incrementally (`after` = newest cached start date).
- The `X-ReadRateLimit-*` headers are probably not readable from the browser
  (not CORS-exposed), so `strava.js` counts its own requests and treats 429 as
  authoritative (wait for the next window; a second 429 in a row = daily limit).
- New apps have **athlete capacity 1** ("Single Player Mode"). The owner can
  self-upgrade to 10 in Strava's API settings; more than 10 needs Strava's review.
- Scopes requested: `read,activity:read_all`.
- GitHub user `ondrejstuchlikk`; site = https://ondrejstuchlikk.github.io/freeStrava/.
  Callback domain in the Strava app = `ondrejstuchlikk.github.io`.
  `localhost` is always allowed by Strava for local testing.
- Strava brand guidelines: use "Connect with Strava" and "Powered by Strava"
  wording/assets; don't imply affiliation.

## Files

```
docs/                 GitHub Pages site (everything public)
  index.html          landing + dashboard + settings dialog
  css/style.css       mobile-first; color tokens for light/dark on :root
  js/config.js        STRAVA_CLIENT_ID + WORKER_URL (public values)
  js/auth.js          OAuth redirect, token storage/refresh, logout
  js/strava.js        API client, rate-limit handling, paging
  js/db.js            IndexedDB cache
  js/metrics.js       pure math: load, CTL/ATL/TSB, volume, weekly load
  js/charts.js        Chart.js rendering (colors read from CSS tokens)
  js/export.js        CSV/JSON download helpers
  js/demo.js          synthetic data for ?demo
  js/app.js           UI controller
worker/worker.js      Cloudflare Worker (token exchange only)
worker/wrangler.toml  optional, for CLI deploys
tests/                pure-JS tests, run with ./tests/run.sh (macOS JavaScriptCore; no Node)
```

## Metrics (in `docs/js/metrics.js`)

- Training load on a TSS-like scale (100 ≈ 1 h at threshold). Priority:
  power (if user set FTP and device_watts) → HR (Banister TRIMP from average
  HR, scaled so 1 h at 85% HRR = 100) → pace (runs/walks/hikes, IF² × hours)
  → duration × sport-default intensity.
- Fitness (CTL) = 42-day exponential average, Fatigue (ATL) = 7-day, Form
  (TSB) = yesterday's CTL − ATL.
- Weekly load "typical range" = previous 3 weeks' average × 0.75…1.25 (rough
  stand-in for Strava's relative-effort range).
- Max HR / threshold pace are estimated from data unless the user sets them.

## Roadmap

- **MVP (built)**: login, incremental sync with progress + rate-limit waits,
  fitness/fatigue/form, weekly load + per-activity load (with Strava's own
  `suffer_score` shown when present), volume by week/month/year and sport,
  CSV/JSON export, settings, demo mode, disconnect & delete.
- **Phase 2**: per-activity streams (`/activities/{id}/streams`,
  keys time,distance,heartrate,watts) fetched lazily in the background with a
  request budget, caching only derived results → HR-zone distribution, best
  efforts (fastest 1k/5k/10k…, best 5/20/60-min power) and progress over time,
  more accurate HR load from full HR streams.
- **Later**: year-over-year comparisons, gear mileage, PWA/offline.

## Working conventions

- Keep it buildless; don't add npm/bundlers unless clearly worth it.
- Keep `metrics.js` DOM-free and add tests in `tests/metrics.test.js`.
- Local preview: `cd docs && python3 -m http.server 8000`, then open
  http://localhost:8000/?demo (sample data) or http://localhost:8000/ (real
  login; add `http://localhost:8000` to the Worker's ALLOWED_ORIGINS).
- User-facing text: plain, friendly, non-technical English.
- Owner's machine has git, python3, Homebrew and gh (GitHub CLI); no node or wrangler.
