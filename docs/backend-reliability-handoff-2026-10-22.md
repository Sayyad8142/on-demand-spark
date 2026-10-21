# Backend reliability handoff — 2026-10-22

For the Supabase / Admin Panel project. **Nothing here is deployed.** Saving any file under `supabase/functions/` in the Worker App project auto-deploys it to production, so every backend change below is specified here instead of being edited in place. Reference rules + tests: `src/lib/workerReachability.ts`, `src/lib/__tests__/workerReachability.test.ts`.

## 1. Worker health watchdog — `worker-health-watchdog` (cron */2)
**Evidence (LIVE):** B kalpana had **994 OFF + 994 ON** `system_auto_offline` events between 10-10 and 10-14, each pair about 1 second apart. Source: `HEARTBEAT_STALE_MIN = 5` (`index.ts:29`) against a 15-min background heartbeat (`HeartbeatWorker.kt`), which Android may defer further.
**Change:**
- A stale heartbeat only marks the connection stale (`availability_state`, display). It **never** sets `is_available=false`.
- Keep the pause only for no token / invalid token (`watchdogDecision → pause_no_token`).
- Restore only when the watchdog's own pause is still the latest change (`auto_paused_source='watchdog'` AND `availability_last_source='system_auto_offline'`). Never restore after a worker or admin change.
- Add a 30-minute cool-down between auto changes for the same worker.
**Tests:** port the 5 `watchdog rule` cases; add a flapping test (two runs 1 s apart → at most 1 change).
**Also check:** the `auto-heal-stale-workers` cron (*/3) — DB-side, source not in repo.

## 2. Dispatch overlay filter — `booking-notifications/index.ts:243-244` (+ deployed `quality-rank-50`)
Remove `.not("overlay_permission_granted","is",false)` and the matching reason at `:206`. Keep the `notification_permission_granted` filter. Test: `declined popup permission does not exclude`.

## 3. Deployed dispatcher ≠ repo
Logs show `version=2026-10-21.quality-rank-50` with a "freshness SOFT priority" line that does not exist in this repo. Export the deployed source, diff it, and confirm there is no hidden `last_seen_at`/`last_app_opened_at` filter in `dispatch-pending-bookings`, `notify-next-tier`, `check-scheduled-bookings` or DB dispatch RPCs.

## 4. ACK receiver — `ack-booking-delivery`
Deploy the corrected handler (`docs/ack-recovery/staged/`) after its tests and a backup of the live version (`DEPLOY_AND_ROLLBACK.md`). The live build accepts only `received`/`opened` and trusts any body `worker_id` (LIVE probe). Delivery states must stay separate: offer created → `push_sent` (FCM accepted) → `push_received` → `popup_shown` → accepted / rejected / expired / unknown. Never set `push_delivered_at` from FCM acceptance.

## 5. Reject core
Apply `docs/reject-fix/001_reject_core_array_fix_DRAFT.sql` after `reject_core.offline.test.ts` (19/19) and a re-check against the live definition (`000_reject_core_LIVE_BACKUP.sql`).

## 6. Expired pending offers — `get-pending-worker-bookings`
Do not return requests past `expires_at`; never reissue a new timeout for an old offer (PRIOR F9). The app already refuses them client-side.

## 7. Token eligibility + reachability diagnostics
- Dispatch excludes no-token/invalid-token workers. Admin should show them as **"ON but not reachable — no alert registration"** with the reason (`dispatchExclusions`).
- Live: Janaki, Ratnamma, Bharati, Prameela (PHF) — ON with no token. Not repaired until their phones register.
- Narrow token invalidation to `UNREGISTERED` / `registration-token-not-registered` only (PRIOR F7).

## 8. Busy state
`heal-stuck-busy-workers-hourly` is a safety net only. Recalculate `is_busy` in the same transaction as complete / cancel / reassign (`complete-booking-with-otp`, `admin_cancel_booking*`, `admin_reassign_booking_worker`). Never free a worker who still has an active booking.

## 9. Rating tiers (Phase 11 finding)
Ramya Sri and Jyothi G (joined 10-15 / 10-18, rating 4.00, priority 25) received 0 offers because tier 1 (≥4.5) is offered first and tier 2 only when tier 1 is empty. This is a ranking-policy decision, not an app bug. Unchanged.

## 10. Minimum version
`app_config.min_worker_version_code` already drives the update-required screen (`useForceUpdateCheck`). Versions 6.0.64 / 7.0.x send no device confirmations. Raise the minimum only after the new APK is tested and approved.
