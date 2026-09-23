# freeStrava

Fitness / fatigue / form, weekly training load, volume trends and data export
for your Strava activities. It runs in your browser and nothing is stored on a
server. See [CLAUDE.md](CLAUDE.md) for the architecture.

Preview with sample data: open `/?demo` on the live site, or run locally:

```sh
cd docs && python3 -m http.server 8000   # then open http://localhost:8000/?demo
```

## One-time setup

### 1. Put the code on GitHub and turn on Pages

1. Log in once with `gh auth login` (GitHub.com → HTTPS → log in with a web browser).
2. Create the **public** repo and push: `gh repo create freeStrava --public --source . --push`.
   (GitHub Pages is free only for public repos. The repo contains no secrets.)
3. Turn on Pages from `/docs` on `main`:
   `gh api -X POST repos/ondrejstuchlikk/freeStrava/pages -f "source[branch]=main" -f "source[path]=/docs"`
   (or on github.com → repo → **Settings → Pages** → branch **main**, folder **/docs**).
4. After ~1 minute, the site is at `https://ondrejstuchlikk.github.io/freeStrava/`.
   It will say "isn't set up yet" until steps 2–4 are done.

### 2. Register the Strava API app

1. Go to <https://www.strava.com/settings/api> (log in with your Strava account).
2. Fill in:
   | Field | Value |
   |---|---|
   | Application Name | e.g. `Training Stats`. Strava doesn't allow the word "Strava" in app names |
   | Category | Visualizer |
   | Website | `https://ondrejstuchlikk.github.io/freeStrava/` |
   | Authorization Callback Domain | `ondrejstuchlikk.github.io` (the domain only: no `https://`, no path) |
3. Upload any icon, then save. Note the **Client ID** and **Client Secret**.
4. Your friends can't connect yet: new apps allow only 1 athlete (you). On the
   same page, use the option to raise **athlete capacity to 10** (you can do
   this yourself, no review needed). More than 10 needs Strava's app review.

### 3. Deploy the Cloudflare Worker (from the browser, no install needed)

1. Sign up at <https://dash.cloudflare.com/sign-up> (Free plan).
2. **Workers & Pages → Create → Create Worker** → name it `freestrava-auth` →
   **Deploy** (with the hello-world code).
3. **Edit code** → delete everything → paste the whole of `worker/worker.js` →
   **Deploy**.
4. Worker → **Settings → Variables and Secrets** → add:
   | Type | Name | Value |
   |---|---|---|
   | Text | `STRAVA_CLIENT_ID` | your Client ID |
   | Secret | `STRAVA_CLIENT_SECRET` | your Client Secret |
   | Text | `ALLOWED_ORIGINS` | `https://ondrejstuchlikk.github.io,http://localhost:8000` |
   Deploy again if prompted.
5. Copy the Worker URL, e.g. `https://freestrava-auth.YOURSUBDOMAIN.workers.dev`.

### 4. Connect the frontend

Edit `docs/js/config.js`: set `STRAVA_CLIENT_ID` and `WORKER_URL` (no trailing
slash), then commit and push (`git commit -am "Configure" && git push`). Pages redeploys in about a minute.

### 5. Share

Send `https://ondrejstuchlikk.github.io/freeStrava/` on WhatsApp. If login fails in
WhatsApp's built-in browser, friends should tap ⋯ → **Open in browser**.

## Limits to know

- Strava's request limit is shared by everyone using your app: 100 reads per 15
  minutes and 1,000 per day. Loading a history costs about 1 request per 200
  activities, and later visits fetch only new activities. If the limit is hit,
  the app waits and shows a countdown.
- Stats are estimates from each activity's average HR, pace or power. Setting max and
  resting heart rate in **Settings** makes them more accurate.
- Strava's brand guidelines ask for their official "Connect with Strava" button
  and "Powered by Strava" logo images. Download them from
  <https://developers.strava.com/guidelines/> if you want to swap them in.

## Tests

```sh
./tests/run.sh
```
