# Lock down send-fcm and send-webpush — STAGED, NOT DEPLOYED

Status: ready, waiting for owner GO. Nothing under `supabase/functions/` or the live database
was changed (saving there deploys to production).

## Problem (repo copy; live version NOT VERIFIED)
- `send-fcm` only checks that an `Authorization` header exists; `send-webpush` checks nothing.
- Anyone with the public anon key can push fake "New Booking" alerts to any worker.

## Every caller found (SOURCE = repo, LIVE = read from production DB 2026-11-07, read-only)
| Caller | Auth today | Change needed | Staged file |
|---|---|---|---|
| booking-notifications (first dispatch, favourite worker) | `Bearer ANON_KEY` (SOURCE) | service-role key | `staged-functions/booking-notifications/` |
| notify-next-tier (rejection redispatch) | `Bearer ANON_KEY` (SOURCE) | service-role key | `staged-functions/notify-next-tier/` |
| fcm-keepalive | service-role key (SOURCE) | none | — |
| worker-health-watchdog | service-role client invoke (SOURCE) | none for auth, see finding 1 | — |
| trigger `notify_assigned_worker_booking_cancelled` (cancel push) | public key in function body (LIVE, trigger active) | add `x-internal-key` | `db-triggers/migration.sql` |
| trigger `notify_start_otp_reminder_cancel` (Start OTP reminder stop) | public key (LIVE, trigger active) | add `x-internal-key` | `db-triggers/migration.sql` |
| `send_new_booking_push`, `send_job_assigned_push` | public key / none (LIVE) | none — no active trigger uses them | — |
| Cron jobs | none call send-fcm/webpush directly (LIVE) | none | — |
| Worker App Verify Push page → send-webpush | worker session, own id, TEST_PUSH | none | — |
| Admin Panel test/broadcast tools | NOT VERIFIED | must use an admin session | — |
| Scheduled reminders (check-scheduled-bookings) | does not call send-fcm (SOURCE) | none | — |

## Rule (`notify_auth.ts` + `staged-functions/_shared/notify_guard.ts`)
Allow: service-role key · valid `x-internal-key` (= edge secret `DISPATCH_INTERNAL_KEY` = vault
`dispatch_internal_key`) · admin user · a worker sending `TEST_PUSH` to only her own id.
Refuse: no token (401), public key alone, other workers, a worker sending a booking alert (403).
Tests: 12 rule tests + 5 guard tests, offline (`deno test`). DB trigger change rehearsed on a
throwaway Postgres with copies of the live functions (`db-triggers/rehearsal.sh`): header added,
idempotent, still sends if the secret is missing, rollback removes it.

## Rollout (each step needs GO)
1. Note the deployed versions of send-fcm, send-webpush, booking-notifications, notify-next-tier.
2. **Phase 1 – observe:** set edge secrets `NOTIFY_AUTH_MODE=observe` and `DISPATCH_INTERNAL_KEY`
   (same value as vault `dispatch_internal_key`). Copy `staged-functions/_shared/*` and the staged
   send-fcm / send-webpush. Nothing is blocked; logs show `notify_auth` with `reason`.
3. **Phase 2 – fix callers:** deploy staged booking-notifications and notify-next-tier; apply
   `db-triggers/migration.sql`. Watch logs 24 h: every real call should show `allow:true`
   (`service_role` or `internal_key`). Any `observe_refuse` = an unknown caller; fix it first.
4. Verify on staging/live in observe mode: new booking alerts first tier + favourite worker;
   reject → next tier alerted; cancel → "BOOKING CANCELLED" arrives; Start OTP → reminders stop.
5. **Phase 3 – enforce:** set `NOTIFY_AUTH_MODE=enforce`. Re-run step 4; a call with only the
   public key must get 403/401.
6. Rollback: set `NOTIFY_AUTH_MODE=observe` (instant). DB: `db-triggers/rollback.sql`.
   Functions: redeploy the versions noted in step 1.

## Findings while mapping callers (not fixed, need owner decision)
1. worker-health-watchdog sends `{ token: ... }` but send-fcm requires `workerIds` → it gets
   400, so "you were paused" pushes likely never arrive today (SOURCE; live NOT VERIFIED).
2. Cron `fcm-keepalive-job` calls `https://YOUR_PROJECT_REF.supabase.co/...` — a placeholder
   URL, so the keep-alive ping is probably not running (LIVE cron text).
3. booking-notifications and notify-next-tier embed the public key in source; harmless after
   the change but can be removed later.
