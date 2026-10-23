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

## Booking popup safety (added)
- While a booking offer popup is active (until its expiry, max 3 min), the optional sheet, the "update after this job" banner and the mandatory screen are all held back; Accept/Reject are never covered.
- During accepted/ongoing bookings the mandatory screen is deferred until the job ends. "Later" 3-day cooldown unchanged.
- Read-only listener on the booking alert coordinator; availability, assignment, acceptance, completion, dispatch untouched.
- Native Android overlay popup draws above the app, so app screens cannot cover it.

## Controlled test build (not run, not published)
GitHub Actions → "android-apk" → Run workflow (manual only) → download debug APK (versionCode 102, app.didisnow.worker). Install on a test phone without the Play Store version; sign in with a test worker only.

## Device checklist
1. Admin row worker/android inactive → no prompt.
2. On a staging/test copy only: soft for build 102 → sheet appears; "Update Now" opens Play listing app.didisnow.worker; back from Play → rechecks at once.
3. "Later" → hidden; reopen app → still hidden (3 days).
4. Sheet open, then send test offer → sheet disappears, Accept/Reject fully usable; after offer ends, sheet may return.
5. Force (test only) while idle → full screen; during accepted job → banner only; after completion → full screen.
6. Force + incoming offer → offer answerable, no block until it ends.
7. Airplane mode → no prompt, app usable.
8. Availability, accept, complete unchanged throughout.

## Remaining risks
- Not tested on a real phone; booking offers that reach only the native screen while the app is closed are covered by the native overlay, not by this rule.
- Testing soft/force needs a non-production config; production row must stay unchanged without approval.
- Force needs store_verified_version = latest_version (row currently 6.0.66 / build 1, mismatched).
