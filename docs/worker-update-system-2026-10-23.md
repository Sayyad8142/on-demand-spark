# Worker App update system (Android) — connected to Admin Panel contract

Status: implemented in development. NOT deployed, NOT published, no settings changed.

## Contract used
`POST /rest/v1/rpc/get_app_update_decision` with the public app key, body `{"_app":"worker","_platform":"android","_build":<installed Android versionCode>}`.
The app uses the returned `decision` directly (none/soft/force). Legacy `app_config` fields are no longer read for updates.

## Safety rules in the app
- Offline, error, malformed answer, unknown decision, answer for another app/platform, or force without `min_build` → no prompt.
- `store_url` used only if it is `https://play.google.com/store/apps/details?id=app.didisnow.worker`; otherwise the fixed official link.
- Soft sheet hidden during active bookings; "Later" hides it for 3 days or until a newer latest build.
- Force deferred during active bookings (banner), applied after the job.
- Recheck on every app resume (not throttled), so returning from Google Play rechecks immediately.
- Never changes availability, bookings, acceptance or completion. Native Play in-app trigger stays disabled.

## Live check (read-only)
- worker/android row: inactive, latest_build 1, min_build 1 → build 102 gets `none`. Unknown target → `none`. Anon can execute the RPC.

## Remaining
1. New Android build via Play Store (build 102 already ships the disabled Play trigger).
2. Activating soft/force = editing the worker/android row in the Admin Panel (owner approval). Note RPC requires `store_verified_version = latest_version` for force.
3. Not checked on a real phone; not tested signed in.
