// Public configuration. Nothing here is secret: the client ID is visible in
// every Strava login URL anyway. The client secret lives only in the Worker.
export const CONFIG = {
  STRAVA_CLIENT_ID: "REPLACE_WITH_CLIENT_ID",
  // e.g. "https://freestrava-auth.yourname.workers.dev" (no trailing slash)
  WORKER_URL: "REPLACE_WITH_WORKER_URL",
  // Read-only access to all activities, including private ones.
  SCOPE: "read,activity:read_all",
};

// Strava sends the user back to the page they started on.
export const REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, "");

export const isConfigured = () =>
  !CONFIG.STRAVA_CLIENT_ID.startsWith("REPLACE") && !CONFIG.WORKER_URL.startsWith("REPLACE");
