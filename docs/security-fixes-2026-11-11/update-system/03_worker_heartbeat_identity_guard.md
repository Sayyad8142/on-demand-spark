# STAGED — worker-heartbeat identity guard (do not paste into supabase/functions/ without approval)

## Problem (SOURCE: supabase/functions/worker-heartbeat/index.ts:64-104)
The receiver trusts a body `worker_id` first, with only the anon key, and writes
`fcm_token`, `app_version`, last-seen for that worker using the service role.
Anyone with the public anon key can overwrite another worker's push token / version.

## App side (DONE in this release)
- Web heartbeat: no `worker_id`; login JWT only; skipped when signed out.
- Native heartbeat: sends the stored login JWT and **no** `worker_id` when the JWT is fresh;
  falls back to legacy anon + `worker_id` only when no fresh login (`HEARTBEAT_LEGACY_ID_FALLBACK=true`),
  tagging the body `auth_mode: "session" | "legacy_worker_id"`.
- Both send `build_number` and `app_platform` (real installed build).

## Server change (PROPOSED), three stages controlled by env `HEARTBEAT_ID_MODE`
1. `observe` (default): unchanged behaviour; additionally, when a JWT resolves a worker and a body
   `worker_id` is also present and differs → log `heartbeat_id_mismatch` (no secrets, ids truncated).
   Count `auth_mode` values per day.
2. `prefer_jwt`: if a valid JWT resolves a worker, always use it (ignore body id).
   Legacy body id accepted only when there is no JWT, and then it may update last-seen only —
   **never** `fcm_token` / `app_version`.
3. `enforce`: body `worker_id` ignored entirely; no JWT → 401. Turn on only after
   native builds with JWT heartbeats are > 95 % of active workers (use `admin_worker_version_fleet`)
   and `legacy_worker_id` volume is ~0 for 7 days. Then set `HEARTBEAT_LEGACY_ID_FALLBACK=false` in the app.

Also persist the new fields when present and valid:
`build_number` (integer 1..1e9 → text column), `app_platform` in ('android','ios','web').

## Rollback
Set `HEARTBEAT_ID_MODE=observe` (or redeploy previous function version). App needs no change.

## Dispatch impact
Stage 1–2: none. Stage 3 could stop heartbeats from phones whose login has expired in the
background, which may change reachability scores → needs separate dispatch approval.

## 2026-11-11 correction
The DEPLOYED receiver differs from the repo copy: it returns 400 `worker_id required` when the body
has no worker_id. Apps therefore send their own worker_id again (plus the login JWT). Removing
worker_id from apps must wait until the guarded receiver is deployed.
