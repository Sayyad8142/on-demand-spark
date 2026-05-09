# Phase 2 — Production-grade Reachability & Self-Healing

Goal: workers receive bookings reliably even after reboot/idle/token rotation, and are auto-excluded from dispatch when notifications are not actually reaching the device. No manual app-open required.

All changes are additive and gated by a `dispatch_reachability_guard` feature flag (default ON in code, easy to flip via env var) so the live dispatch flow is never broken.

---

## 1. Database (single migration)

New columns on `workers`:
- `availability_state` text default `'OFFLINE'` — enum-like: `ONLINE_HEALTHY | ONLINE_DEGRADED | OFFLINE | TOKEN_STALE | NOTIFICATION_BLOCKED | BATTERY_RESTRICTED`
- `last_keepalive_sent_at` timestamptz
- `last_keepalive_ack_at` timestamptz
- `last_notification_received_at` timestamptz
- `last_fcm_token_refresh_at` timestamptz
- `notification_permission` text  (`granted|denied|unknown`)
- `battery_optimized` boolean
- `app_standby_bucket` text (active/working_set/frequent/rare/restricted)
- `consecutive_delivery_failures` int default 0
- `dispatch_cooldown_until` timestamptz
- `reliability_score` numeric(5,2) default 100.0

New table `notification_delivery_events`:
- `worker_id`, `booking_id` (nullable), `event_type` (sent/delivered/opened/expired/ignored/failed/token_invalid/unreachable/keepalive_sent/keepalive_ack), `payload jsonb`, `created_at`. RLS: workers select own; service role full.

Helper RPC `compute_worker_availability_state(uid)` returning the derived state — used by triggers and dispatcher.

---

## 2. Edge Functions

**fcm-keepalive** (cron, every 20 min, `verify_jwt=false`)
- Selects workers where `is_available=true` AND `fcm_token` not null AND (`last_keepalive_sent_at` is null OR < now()-15m).
- Sends data-only FCM `{type:"PING", ts:...}` via existing send-fcm helper.
- Stamps `last_keepalive_sent_at`, logs `keepalive_sent` event.

**worker-keepalive-ack** (`verify_jwt=false`, Firebase token verified in code)
- Body: `{worker_id, battery_optimized, app_standby_bucket, notification_permission, fcm_token}`.
- Updates `last_keepalive_ack_at`, `last_notification_received_at`, permission/battery/standby fields.
- Resets `consecutive_delivery_failures=0`, recomputes `availability_state`.
- Logs `keepalive_ack`.

**dispatch-pending-bookings** (modify)
- Before invoking `booking-notifications`, call new SQL filter: exclude workers where guard fails.
- New shared helper `reachabilityGuard(worker)`:
  - TOKEN_STALE if `last_fcm_token_refresh_at < now()-7d`
  - NOTIFICATION_BLOCKED if `notification_permission='denied'`
  - cooldown if `dispatch_cooldown_until > now()`
  - DEGRADED if `last_keepalive_ack_at < now()-45m` AND `last_active_at < now()-10m`
  - UNREACHABLE if no ack in 90m AND no notif received in 60m
- Increment `consecutive_delivery_failures` and set `dispatch_cooldown_until = now()+10m` after each timed-out booking_request (sweep step).
- Behind env flag `DISPATCH_REACHABILITY_GUARD=1`.

**booking-notifications** (modify)
- Log `sent` event per worker request.
- Skip workers with `availability_state IN ('TOKEN_STALE','NOTIFICATION_BLOCKED')` or active cooldown — log `dispatcher_skipped_unreachable`.

**ack-booking-delivery** (modify)
- Existing endpoint: also stamp `last_notification_received_at`, log `delivered`.

---

## 3. Native Android

**MyFirebaseService.java**
- On `onMessageReceived`, if `data.type == "PING"`, call new `KeepaliveAckWorker` (WorkManager) — do NOT show notification.
- Worker collects: token, battery-optimization status (`PowerManager.isIgnoringBatteryOptimizations`), standby bucket (`UsageStatsManager.getAppStandbyBucket` API 28+), notification permission (`NotificationManagerCompat.areNotificationsEnabled`), saved `worker_id`.
- POSTs to `worker-keepalive-ack` with bearer token from SharedPreferences.
- Always stamp `last_notification_received_at` on every FCM message via `BackendSync.pingReachable()`.

**BackendSync.kt**
- Add `postKeepaliveAck(payload)` and `pingReachable()` helpers (reuses existing pattern).
- Retry queue: persist failed POSTs to SharedPreferences, replay on next FCM/boot/network event via existing `FcmBootSyncWorker` extended with a `replayQueue()` step.

**WorkerLog.kt** — add tags `KEEPALIVE`, `REACHABILITY`.

---

## 4. Frontend (Worker App)

**OEM Reliability Card** (`src/components/profile/OemReliabilityCard.tsx`)
- Detects MIUI/Vivo/Oppo/Realme/Huawei via existing `oemHints.ts`.
- Surfaces guided steps: auto-start, lock in recents, disable battery opt, allow background.
- Banner on Home if `availability_state IN ('TOKEN_STALE','NOTIFICATION_BLOCKED','BATTERY_RESTRICTED')`.

**AvailabilityToggle** — show derived `availability_state` chip.

**AuthDebug** — add Keepalive section (last sent/ack, reliability score, recent delivery events).

---

## 5. Admin Reliability Dashboard

Out of scope of the worker app codebase but I will add a read-only Supabase view `worker_reliability_v` (last_active, last_keepalive_ack, fcm_token_updated_at, last_boot_at, success%, OEM, battery_optimized, permission, state) so the existing admin app can consume it.

---

## 6. Self-Healing Loop

- **Token verification**: existing `useFCMTokenSync` extended to call `getToken({forceRefresh:true})` if `last_fcm_token_refresh_at > 6d`.
- **Auto re-registration**: if `worker-boot-ping` returns `token_invalid`, native side requests fresh token and resyncs.
- **Offline queue**: failed POSTs stored in `pending_backend_sync` SharedPreferences; replayed by `FcmBootSyncWorker` on every trigger (boot, FCM, manual).
- **Safety**: if `notification_permission='denied'` OR `dispatch_cooldown_until>now()+1h`, set `availability_state='NOTIFICATION_BLOCKED'` and show full-width warning banner with "Fix now" CTA in worker app.

---

## 7. Logging

Structured logs (`console.log` JSON) in every edge function for:
`keepalive_sent`, `keepalive_ack`, `reachability_failure`, `token_stale`, `worker_degraded`, `dispatcher_skipped_unreachable`, `cooldown_applied`, `auto_offline`.

Native: `WorkerLog.add(ctx, "KEEPALIVE", ...)` mirrored in AuthDebug.

---

## 8. Files to add / modify

Add:
- `supabase/migrations/<ts>_phase2_reachability.sql`
- `supabase/functions/fcm-keepalive/index.ts`
- `supabase/functions/worker-keepalive-ack/index.ts`
- `supabase/functions/_shared/reachabilityGuard.ts`
- `android/.../KeepaliveAckWorker.kt`
- `android/.../DeviceDiagnostics.kt` (extracted from BatteryOptimizationPlugin)
- `src/components/profile/OemReliabilityCard.tsx`
- `src/components/ReachabilityBanner.tsx`

Modify:
- `supabase/config.toml` (register 2 new functions, verify_jwt=false)
- `supabase/functions/dispatch-pending-bookings/index.ts`
- `supabase/functions/booking-notifications/index.ts`
- `supabase/functions/ack-booking-delivery/index.ts`
- `android/.../MyFirebaseService.java`
- `android/.../BackendSync.kt`
- `android/.../FcmBootSyncWorker.kt`
- `android/.../WorkerLog.kt`
- `src/hooks/useFCMTokenSync.ts`
- `src/pages/AuthDebug.tsx`
- `src/pages/Home.tsx` (mount ReachabilityBanner)
- `src/components/AvailabilityToggle.tsx`

A pg_cron schedule (every 20 min) for `fcm-keepalive` will be inserted via the insert tool (contains anon key — not via migration).

---

## 9. Out of scope
- iOS support
- Replacing FCM/Cashfree
- Admin UI implementation (only the SQL view is added)
- Changing existing booking dispatch tier logic

---

## 10. Rollout
1. Migration + edge functions deploy.
2. Native release built (workers update via OTA/Play).
3. Flip `DISPATCH_REACHABILITY_GUARD=1` once 80%+ workers have acked at least one keepalive (verified via dashboard view).
