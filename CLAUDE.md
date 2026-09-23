# freeStrava — project context

Web app that gives Strava users the deep activity analysis Strava normally
puts behind its paid subscription. Built for the owner's **non-technical
friends**: they open a link (shared via WhatsApp, often on a phone),
download an activity file from Strava, open it in the app, and see the analysis.

Live: https://ondrejstuchlikk.github.io/freeStrava/ (GitHub user `ondrejstuchlikk`,
public repo `freeStrava`, GitHub Pages from `main` → `/docs`). Demo: `#/demo`.

## Architecture (decided 2026-09-23)

- **No Strava API.** Since June 2026 creating a Strava API app requires a paid
  Strava subscription, so the original API + OAuth + Cloudflare Worker design
  was dropped (it's in git history: commit d21835a).
- **Input = activity files the user exports themselves.** Adding
  `/export_original` (usually FIT), `/export_gpx` or `/export_tcx` to a
  strava.com activity URL downloads the file when logged in on the website,
  for your own activities only. The app builds that link from a pasted URL and
  the user then picks the downloaded file. The app can NOT fetch it itself
  (cross-origin + needs the user's Strava cookies; a server holding
  credentials would break Strava's terms). Never add scraping.
- **Static site, everything in the browser**: plain HTML/CSS/vanilla JS ES
  modules, no build step, no npm. Chart.js 4 (jsDelivr) and Leaflet 1.9.4
  (cdnjs) are pinned with SRI hashes. Map tiles from OpenStreetMap (attribution shown).
- **Storage**: IndexedDB `freestrava` in the user's browser: `summaries`
  (small per-activity records) + `streams` (the normalized activity, so it
  can be reopened/re-analysed). Settings in localStorage. Nothing leaves the device.
- **Free**: GitHub Pages only.

## Files

```
docs/
  index.html            all views (home/add, activity, fitness, trends) + settings dialog
  css/style.css         mobile-first; light/dark color tokens on :root
  js/parsers/fit.js     own FIT decoder (compressed timestamps, dev fields, chained files)
  js/parsers/xml.js     GPX + TCX (DOMParser, namespace-agnostic)
  js/parsers/index.js   detect type (magic bytes / XML root), gunzip .gz
  js/activity.js        normalize any file → {t, dist, lat, lon, alt, hr, cad, power, temp, timerOn, …}
  js/analysis.js        per-activity analysis (pure): moving time, GAP, splits, zones,
                        best efforts, power curve/NP, load, HR drift, pauses, chart series, map track
  js/metrics.js         multi-activity math (pure): settings estimates, fitness/fatigue/form, volume, weekly load
  js/store.js           IndexedDB
  js/charts.js          Chart.js: fitness/form/weekly/volume + synced stream charts
  js/map.js             Leaflet route coloured by pace/HR/grade, hover marker
  js/demo.js            synthetic run + history for #/demo
  js/export.js          CSV/JSON download helpers
  js/app.js             hash router + UI controller
tests/                  ./tests/run.sh — runs *.test.js with macOS JavaScriptCore (no Node)
```

## Analysis notes

- FIT from the Strava iPhone app writes GPS, distance and HR as separate
  `record` messages with the same timestamp; activity.js merges them. Timer
  start/stop events give auto-pause-aware moving time. Running cadence in FIT
  is per leg (×2 for steps/min).
- Moving = timer running AND speed ≥ 0.5 m/s (foot) / 1 m/s (other).
- Grade-adjusted pace uses a polynomial fitted to Strava's 2017 GAP curve
  (`gradeFactor`); Minetti was tried and over-rewarded gentle downhills.
- Load (100 ≈ 1 h at threshold): power (NP, needs FTP) → per-second HR TRIMP
  (scaled so 1 h at 85% HRR = 100) → pace (runs) → duration estimate.
- Zones: HR = 5 zones by % max HR; pace = 6 zones by % threshold speed
  (grade-adjusted); power = Coggan 7 zones by % FTP.
- Estimates when the user hasn't set values: max HR = max seen but ≥ 185;
  threshold pace = best 20-min grade-adjusted speed × 0.95. Changing settings
  re-analyses all stored activities.
- Fitness (CTL 42 d), fatigue (ATL 7 d), form = yesterday's CTL − ATL. Only as
  complete as the activities the user has added — the UI says so.
- Not possible without Strava's servers: segments/leaderboards, others' data,
  heatmaps, Strava's exact Relative Effort.

## Roadmap

- Test the phone flow on real iPhone/Android (strava.com login in mobile
  browser, where the file lands, picking it).
- Import Strava's bulk export ZIP (Settings → My Account → Download your
  data) for full history: read `activities/*.fit.gz|gpx|tcx` lazily from the
  ZIP (large files on phones!); `activities.csv` headers may be localized.
- Laps from FIT, HR/pace scatter, year-over-year, Czech translation.

## Working conventions

- Keep it buildless; keep `analysis.js`/`metrics.js`/parsers DOM-free with tests.
- Never commit personal activity files (`.gitignore` covers *.fit/gpx/tcx/zip):
  they contain GPS tracks and the repo is public.
- Local preview: `cd docs && python3 -m http.server 8000` → http://localhost:8000/#/demo
- UI testing: Playwright + Chromium in a throwaway venv (not in the repo):
  `python3 -m venv venv && venv/bin/pip install playwright && venv/bin/playwright install chromium`.
- User-facing text: plain, friendly, non-technical English. Name must not
  imply Strava affiliation (footer says "Not affiliated with Strava, Inc.").
- Owner's machine: git, python3, Homebrew, gh (logged in); no node.
