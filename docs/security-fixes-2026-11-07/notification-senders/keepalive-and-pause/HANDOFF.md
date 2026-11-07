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

## 4. Does keep-alive help? (LIVE read-only, 2026-11-07)
- Pings sent in last 7 days: 0. Acks: 0 (never). The job has never worked, so there is **no evidence** it helps.
- 20 workers received some notification in 7 days without it; 18 workers are ON.
- Android limits (PRIOR knowledge, NOT VERIFIED on devices):
  - Silent high-priority pushes that show nothing make Google lower the app's high-priority standing →
    could slow real booking alerts. Staged fix: PING sent at NORMAL priority (tested).
  - NORMAL pushes wait for Doze maintenance windows, so a ping proves "token alive", not "instant delivery".
  - Force-stopped apps (some Xiaomi/Oppo/Vivo battery modes) get no pushes at all; a ping can only *detect* this.
  - Ack runs via a plain WorkManager job; it may run late in Doze, so a late ack ≠ unreachable.
- Recommendation: run it for 2 weeks after Stage 2, then compare ack rate vs missed-booking reports before keeping it.

## 5. Bypass check
- send-fcm guard covers every sender (43 flow tests).
- GAP (SOURCE): the relays in front of send-fcm (booking-notifications, notify-next-tier, fcm-keepalive,
  worker-health-watchdog) accept any caller and then use the service key. Staged `relay_auth.ts` closes this;
  same observe → enforce switch.
- The app's rejection redispatch calls notify-next-tier without a provable identity; allowed only when the server
  confirms a real recent rejection for that booking and tier. Better long-term: have `reject_booking_offer` trigger redispatch itself.
- Favourite-worker alerts: no separate sender exists; they go out through booking-notifications as BOOKING_ALERT.
