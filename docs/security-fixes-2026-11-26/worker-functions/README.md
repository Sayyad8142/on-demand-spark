# Worker background functions — staged sign-in hardening (NOT deployed)

Functions: `worker-boot-ping`, `worker-keepalive-ack`, `report-missed-booking`.
Saving files under `supabase/functions/` auto-deploys to production, so the
hardened code is staged here for Admin to apply in two steps.

## Change for each function
Replace the body-`user_id` lookup with `resolveWorker()` from `_shared/workerAuth.ts`:
- Verified Supabase login (`Authorization: Bearer <JWT>`, `auth.getUser`) → worker by `workers.user_id = auth user id`.
- A `user_id` / `worker_id` in the body that differs from the login → **403**. Body ids are never proof.
- `report-missed-booking`: insert `worker_id = resolved worker.id`, `user_id = resolved user_id`; ignore body ids.
- Dedupe in `report-missed-booking` must also filter `.eq("worker_id", worker.id)` (today it dedupes across workers).

## Rollout (protects workers on old builds)
1. Deploy with `WORKER_FN_AUTH_MODE=compat` (default). New Android builds send the login; old builds send only the public key + body id and keep working (logged `auth=legacy`).
2. Release the new Android build. Watch the `auth=legacy` share in function logs.
3. When legacy calls are near zero (or force-update floor raised to the new build), set `WORKER_FN_AUTH_MODE=strict`. Old builds then get 401 on these three calls only; bookings, heartbeat and ACKs are unaffected.
