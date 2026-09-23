# freeStrava

Deep analysis of your Strava activities: splits, grade-adjusted pace,
heart-rate / pace / power zones, best efforts, heart-rate drift, a route map
coloured by pace or heart rate, plus a fitness & freshness curve and training
trends. It runs entirely in your browser: nothing is uploaded, and no Strava
subscription or API access is needed.

**Use it:** https://ondrejstuchlikk.github.io/freeStrava/ · **Demo:** https://ondrejstuchlikk.github.io/freeStrava/#/demo

## How it works

1. Log in on **strava.com** in your browser and open one of your activities.
2. Add `/export_original` to the end of the address (or paste the address into
   the app and tap **Download from Strava**). The activity file downloads.
3. Open that file in the app. It's saved in your browser, so your fitness
   curve builds up as you add more activities.

Supported files: `.fit`, `.gpx`, `.tcx` (also `.gz`).

## Development

No build step. Serve `docs/` with any static server:

```sh
cd docs && python3 -m http.server 8000   # http://localhost:8000/#/demo
./tests/run.sh                            # unit tests (macOS JavaScriptCore)
```

GitHub Pages serves the `docs/` folder of `main`. See [CLAUDE.md](CLAUDE.md)
for architecture and design notes.

Not affiliated with Strava, Inc.
