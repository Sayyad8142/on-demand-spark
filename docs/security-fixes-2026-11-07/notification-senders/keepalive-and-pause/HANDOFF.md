# Worker-pause notice + keep-alive ping — STAGED, NOT DEPLOYED

Nothing here is live. Applying any step needs owner GO.

## 1. Worker-pause notice (worker-health-watchdog)
- SOURCE: `notifyWorker` sends `{ token, notification, data }`. send-fcm requires
  `workerIds` (UUIDs) + non-empty `title`/`body`, so every pause notice is refused with 400 "Invalid workerIds".
- LIVE: cron `worker-health-watchdog` is currently **inactive** (`active=false`), so no auto-pauses run today.
- LIVE: no admin pause path sends a notification (no DB function references `WORKER_PAUSED`
  or calls send-fcm from `worker_emergency_pause`). If the Admin Panel should notify on manual
  pause, it must call send-fcm with the same builder — owner decision.
- Fix (`watchdog.patch`): use `buildWorkerPausedPayload(worker.id, …)`. Service-role call stays
  (passes the staged guard in all three phases). The phone token is never sent in the body.

## 2. Keep-alive (fcm-keepalive + cron `fcm-keepalive-job`)
- LIVE: cron posts to `https://YOUR_PROJECT_REF.supabase.co/...` every 30 min → never reaches the function.
- SOURCE: even if reached, it sends empty title/body → send-fcm 400.
- SOURCE: fcm-keepalive has no caller check (verify_jwt=false).
- Fix:
  - `cron.sql`: re-schedules the job to `https://paywwbuqycovjopryele.supabase.co/functions/v1/fcm-keepalive`
    (the same project URL the other live crons use), every 30 min; the auth header is read at run
    time from vault secret `dispatch_internal_key` (`x-internal-key`) — no key in SQL. `cron-rollback.sql` restores the job as it is now.
  - `keepalive.patch`: uses `buildKeepalivePingPayload`; checks `x-internal-key` (observe-only first: log, don't refuse).
  - `send-fcm` PING branch: PING is sent data-only (no tray notification), like START_OTP_REMINDER_CANCEL.
- Availability: fcm-keepalive only **reads** `is_available` (pings available workers) and writes only
  `last_keepalive_sent_at`; `worker-keepalive-ack` doesn't touch `is_available`. Covered by tests.
- Per-worker throttle stays 120 min inside the function, so 30-min cron = at most ~12 pings/worker/day.

## 3. Lockdown stages (unchanged, see ../HANDOFF.md)
1. Observe-only  2. Migrate callers (these two fixes are part of this)  3. Enforce. Enforcement stays OFF.

## Order to apply (after GO)
1. Deploy send-fcm PING branch. 2. Deploy watchdog + keepalive patches. 3. Run `cron.sql`.
4. Check function logs for `keepalive_sent_batch` and phone log "PING received".

## Tests
`deno test --allow-env docs/security-fixes-2026-11-07/notification-senders/` — offline, no network.
