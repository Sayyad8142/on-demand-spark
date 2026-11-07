# Notification security rollout — final checklist (nothing applied yet)

Every step needs an explicit GO. `NOTIFY_AUTH_MODE` stays unset (= watch only) until Stage 3.

## Stage 1 — Watch only (24 h)  ← FIRST STEP READY FOR APPROVAL
- [ ] 1a. Copy `_shared/notify_auth.ts`, `notify_guard.ts`, `relay_auth.ts`, `relay_guard.ts`, `fcm_payloads.ts` into `supabase/functions/_shared/`.
- [ ] 1b. Deploy send-fcm + send-webpush with `guardNotify` (and silent normal-priority PING branch).
- [ ] 1c. Add `guardRelay(...)` as the first line of booking-notifications, notify-next-tier (pass `booking_id`), fcm-keepalive, worker-health-watchdog. No other change.
- [ ] 1d. Test booking on a test community: alert arrives, Accept works.
- [ ] 1e. After 24 h: list every caller in `notify_auth_observe_refuse` (MONITORING §1).
Rollback: redeploy the previous six functions. No DB change in this stage.

## Stage 2 — Move legitimate callers (then 48 h verification)
- [ ] 2a. notify-next-tier + booking-notifications call send-fcm with the service key.
- [ ] 2b. Watchdog pause payload fix; keep-alive payload fix (cron stays inactive for the watchdog).
- [ ] 2c. `db-triggers/migration.sql` (cancel + reminder-cancel triggers send `x-internal-key`).
- [ ] 2d. `keepalive-and-pause/cron.sql` (real URL, vault key). Separate experiment; kill switch in MONITORING.
- [ ] 2e. Check: booking, favourite-worker, rejection redispatch, cancellation, Start OTP reminder cancel each arrive once.
- [ ] 2f. 48 h: zero `observe_refuse` lines from real senders; missed-alert and ack numbers within baseline (MONITORING §2–3).
Rollback: `db-triggers/rollback.sql`, `cron-rollback.sql` (or pause the job), redeploy previous functions.

## Stage 3 — Enforce
- [ ] 3a. Set secret `NOTIFY_AUTH_MODE=enforce`.
- [ ] 3b. Within 15 min: test booking alert arrives; `enforce_refuse` lines only from fake callers.
Rollback (seconds, no redeploy): set `NOTIFY_AUTH_MODE=observe`.

## Always true (tested)
- Keep-alive never writes `is_available`; PING is data-only, NORMAL priority.
- Pause notice targets the worker id, visible notification.
- After enforcement, no forwarding function lets an anonymous caller through (relay tests).
