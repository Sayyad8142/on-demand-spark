# Worker App ACK + availability root cause — 2026-10-22

Status: Worker App fixes IMPLEMENTED + offline TESTED (117/117). Android NOT COMPILED. Nothing published or deployed. No production availability changed. No live offers sent.

## Task 1 — Why no confirmation reaches the server

**Root cause (VERIFIED live, harmless probes with fake IDs, 0 rows written):**
The `ack-booking-delivery` receiver live in production is an old build. It requires `booking_id` + `worker_id` + `event_type`, and accepts only `event_type = "received" | "opened"`:

| Probe body | Live answer |
|---|---|
| `booking_request_id` only, `push_received` | 400 `booking_id, worker_id, and event_type are required` |
| `booking_id` + `worker_id`, `push_received` / `popup_shown` / `worker_seen` / `accept_tapped` | 400 `event_type must be "received" or "opened"` |
| `booking_id` + `worker_id`, `received` / `opened` | 200 `success: true` |

Every Worker App build since May sends `push_received` / `popup_shown` / `worker_seen` (native `MyFirebaseService.java:224`, `BookingOverlayService.kt:698`, `BookingAlertActivity.kt:307`; JS `src/lib/fcm.ts:70`, `bookingAlertCoordinator.ts:334,351`). So requests do execute and reach the receiver, but are refused with 400 before anything is written. Last recorded device event: 2026-10-14 13:17 UTC (matches the old build going live).

Checklist:
1. ACK executes on push — yes (source). Not verified on a phone.
2. Missing `ack_token` blocks it — no; production pushes carry no token and the app sends token-less ACKs.
3. Missing worker id / expired login — native sends anon key + worker id from device storage; queued if worker id is missing. Not the cause.
4. Correct project/URL — yes, `paywwbuqycovjopryele…/functions/v1/ack-booking-delivery`.
5. Background/killed handlers — native FCM service path is used. NOT VERIFIED on device.
6. Errors swallowed — yes: 400 is classified REJECTED and dropped silently (correct rule, but it hid this).
7. Retry — works for network/5xx; correctly does not retry 400.

**Fix (Worker App, both layers):** on a 400 for a delivery event, retry ONCE with the legacy name (`push_received→received`, `popup_shown/worker_seen→opened`) and `booking_id` + `worker_id`. Accept/reject taps and expiry have no legacy meaning and are never re-sent. Token is never in the legacy body or logs. Safe after the corrected receiver deploys (it maps these aliases too).
- `src/lib/bookingAck.ts` — `LEGACY_ACK_EVENT`, `buildLegacyAckBody`, `ackErrorStatus`, fallback in `ackBookingDelivery`.
- `android/.../BackendSync.kt` — same fallback inside `sendAckHttp`.

Limitation: the legacy receiver trusts a body-supplied worker id with no authentication (it answered 200 to a made-up worker). Security risk on the server side — see Admin Panel dependencies.

## Task 2 — Automatic availability changes

Live `worker_status_history`, 7 days:

| Event | Source label | Role | Count |
|---|---|---|---|
| OFF | manual_toggle / worker | (none recorded) | 80 |
| OFF | manual_toggle / worker | service_role | 48 |
| OFF | job_assigned / busy_recompute | — | 48 |
| ON | manual_toggle / worker | (none) 96, service_role 25 | 121 |
| ON | job_finished / busy_recompute | — | 35 |
| ON | admin_manual_online / admin_panel | authenticated | 29 |

Findings:
- The 48 "worker-labelled from a server function" OFFs are the `update-availability` edge function: it calls `set_worker_availability_manual` with the service-role key and hard-codes `p_source='worker'`. That function is only called from the Worker App's toggle tap (`AvailabilityToggle.tsx:171`; `useWorkerProfile.updateAvailability` has no live caller — `Home.tsx` `handleToggle` is unused). So they are most likely real taps, but the server cannot prove it: the request carried no source or version.
- `set_worker_availability_manual` silently relabels any unknown source as `worker` — this is why labels are unreliable.
- 48 OFF/35 ON from `busy_recompute` (job assigned/finished) is a server rule, not the app.
- `worker-health-watchdog` sets `is_available=false` on stale heartbeat (5 min vs 15–30 min heartbeats) — server side; likely source of reversals.
- Logout (`AuthContext.tsx:272`) writes `is_available=false` directly. Deliberate action, kept.
- No availability write on app start, background, reconnect, token failure, permission change or heartbeat in the Worker App source. The app only re-reads availability on resume/interval.

**Fix:** every availability request now carries `action_source: "toggle_tap"`, `app_version`, `app_version_code` (`src/lib/availabilityRequest.ts`, allowlisted, carries no actor id). The current server ignores the extra fields, so this is safe to ship before the server change.

## Task 3 — Tests
`bunx vitest run`: 117/117 passed (9 new in `src/lib/__tests__/ackLegacyAndAvailability.test.ts`). Android compile: NOT RUN (no Android toolchain here). Foreground / background / locked / reconnect / killed: NOT VERIFIED — needs a real Android phone.

## Admin Panel dependencies (need your approval; nothing deployed)
1. Deploy the corrected `ack-booking-delivery` (accepts current names + `ack_token`, rejects unauthenticated worker ids). Until then only the legacy fallback records anything, and only `received`/`opened`.
2. `update-availability`: write `action_source` + `app_version` into the audit reason, e.g. `p_reason := 'manual_toggle:' || action_source || ':' || app_version`; worker identity stays from the verified token only.
3. `set_worker_availability_manual`: stop relabelling unknown sources as `worker`.
4. Watchdog: stale threshold (5 min) is shorter than the heartbeat interval — causes OFF/ON flapping.
5. Add signed `ack_token` to production pushes (Phase 1C).
