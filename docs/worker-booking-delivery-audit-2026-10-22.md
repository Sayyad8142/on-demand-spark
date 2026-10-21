# Worker Booking Delivery Audit — 2026-10-22 (Phase 1–3, read-only)

Status: AUDIT ONLY. No code, config, worker rows or deployments changed. No offers sent.
Labels: LIVE = read-only production query; SOURCE = repo code; INFERENCE = not proven.

## 1. Confirmed findings

### F1 — No device acknowledgments recorded since 2026-10-14 (LIVE) — highest impact
- `booking_offer_events`, last 7 days: push_sent 956 (26 workers), server_not_delivered 648, server_unreachable 497, server_lost 209, server_accepted 72, server_rejected 143.
- Device events (`push_received`, `popup_shown`, `worker_seen`): **0 in 7 days; last one 2026-10-14 13:17 UTC.** `booking_request_delivery_events`: 0 rows ever recent.
- booking_requests 7d: accepted 16, rejected 17, lost 26, unreachable 25, not_delivered 15, expired_unsent 11.
- Meaning: the server cannot see any phone receiving any offer, so almost every offer ends "not delivered/unreachable". This matches the earlier finding that the deployed `ack-booking-delivery` is an old build and the corrected handler is staged but NOT deployed.
- Not provable from here whether phones actually show the popup. FCM "accepted" is not device delivery.
- Fix location: backend (Admin Panel project owns the ACK handler deploy). Worker app 10.0.02 already sends ACKs with `ack_token`.

### F2 — Offers are NOT concentrated on few workers; acceptances are (LIVE)
- 26 workers received pushes in 7 days (top: 132, 105, 81, 66…).
- Accepts: Rajeswari 20, S Bhanu 12, Thriveni 9, Sumalatha 9; most others 0–3.
- So "only a few get bookings" = a few workers actually respond/accept; others get many pushes that end not_delivered/lost. Combined with F1 this points at delivery/popup, not eligibility.

### F3 — Rating tiers give ≥4.5 workers first access (SOURCE)
- `supabase/functions/booking-notifications/index.ts:371-450`: initial push goes to all Tier 1 (≥4.5); Tier 2/3 only if higher tiers are empty, else via `notify-next-tier`.
- Sort `priority_score DESC, rating DESC, last_offer_at ASC` (`:320-331`) — rotation only as tiebreak.
- Admin Panel change: decide whether lower tiers should be offered in parallel or after a short delay.

### F4 — No direct 24h/48h inactivity exclusion in initial dispatch (SOURCE)
- `booking-notifications/index.ts:226-312`: `last_seen_at` / `availability_state` are selected but not filtered; only `fcm_token` missing or status `invalid` excludes.
- Inactivity only removes a 5-point ranking bonus (`migrations/20260505232433…sql:68-96`).
- The 24h restriction is not in this repo's copy. Deployed dispatcher NOT VERIFIED (Admin Panel owns it). Logs show `freshness fields = SOFT priority only` — consistent with no hard gate.

### F5 — Watchdog pauses after 5 min without heartbeat; heartbeats are 15–30 min (SOURCE + LIVE)
- `worker-health-watchdog/index.ts:29-78,172-182`: `HEARTBEAT_STALE_MIN = 5` → sets `is_available=false`.
- JS heartbeat 30 min (`src/hooks/useWorkerHeartbeat.ts`), native 15 min (`HeartbeatWorker.kt`).
- LIVE: cron `worker-health-watchdog` runs every 2 min (active). Current rows: 2 `heartbeat_stale`, 1 `no_fcm_token` watchdog marks (all currently restored to available). Recent watchdog logs show only boot lines — real effect NOT VERIFIED; needs its run log.
- Risk: background workers flapping off between heartbeats; realtime + polling also stop while offline (`useBookingRequestsRealtime.ts:16`, `useBookingPollingFallback.ts:52`).

### F6 — Keepalive and watchdog pushes are rejected by send-fcm (SOURCE)
- `fcm-keepalive/index.ts:117-122` sends empty title/body; `send-fcm/index.ts:88-91` returns 400 for that. Cron runs every 30 min → no keepalive ever reaches phones.
- Watchdog pause notice uses `{token, data, notification}`; send-fcm needs `workerIds` + title/body.

### F7 — Token invalidation too broad (SOURCE)
- `send-fcm/index.ts:290-318`: `INVALID_ARGUMENT`, `SENDER_ID_MISMATCH`, any 404 → token nulled, status `invalid`; update doesn't check the token is still the one sent (can wipe a fresh token).

### F8 — Worker app overstates health (SOURCE, worker app)
- `src/lib/pushToken.ts:143-159` writes `availability_state='ONLINE_HEALTHY'`, `notification_health='good'`, `no_ack_count=0` just for syncing a token; does not set `is_available` (good). Clears failure evidence.

### F9 — Recovery returns expired offers as fresh (SOURCE)
- `get-pending-worker-bookings/index.ts:90-114` returns `timed_out`/`not_delivered` requests from last 30 min as `status:"pending"` with a new 60s `timeout_at` (response only).
- Acceptance-time expiry guard in `atomic_accept_booking`: NOT VERIFIED. Explicit expiry checks found only in `reject_booking_offer`.

### F10 — next-tier gaps (SOURCE)
- `notify-next-tier/index.ts:56-103` rechecks payout only (not availability/busy/blocked) and doesn't extend `timeout_at`.

### F11 — Realtime reconnect has no backfill (SOURCE)
- `useBookingRequestsRealtime.ts:110-112` only logs status; polling fallback is the recovery path.

## 2. Lifecycle telemetry
| Stage | Telemetry | Gap |
|---|---|---|
| Booking created / eligible | dispatch logs, `dispatch_runs` | per-worker exclusion reason not stored |
| Offer generated | `booking_requests` | — |
| FCM request/response | `push_sent`, `fcm_last_fail_*` | FCM message id per offer |
| Device received / notification / popup | `push_received`, `popup_shown` | **dead since 10-14 (F1)** |
| Accept / reject | server_accepted / rejected | — |

## 3. Scenarios (from code; none device-tested)
App open: Realtime + FCM foreground. Background/swiped: FCM data → native service/notification. 48h unopened: still eligible if available + token valid (F4), unless watchdog paused (F5) or token invalidated (F7). Locked: notification only. No internet: nothing; FCM queues up to TTL. Notification permission off: excluded only if `notification_permission=false` reported. Battery restricted: data push may be delayed. Expired token: send-fcm marks invalid → excluded until app re-syncs. Opened after expiry: F9 may show it again.

## 4. Admin Panel / backend changes needed (not done from here)
1. Deploy the corrected `ack-booking-delivery` (F1) — owner approval required.
2. Fix keepalive and watchdog payloads (F6).
3. Raise watchdog stale threshold above heartbeat interval (e.g. >45 min) or stop pausing on heartbeat age (F5).
4. Narrow token invalidation to UNREGISTERED/NOT_FOUND and compare token (F7).
5. Revisit rating-tier exclusivity (F3); next-tier eligibility + deadline (F10).
6. Stop rewriting expired offers as pending; confirm accept checks expiry (F9).
7. Confirm deployed dispatcher has no 24h gate.

## 5. Worker app fixes proposed (Phase 4, awaiting approval)
- F8: stop writing health/availability claims in `syncTokenToBackend`.
- F11: re-fetch pending offers on Realtime `SUBSCRIBED` after reconnect.
- Client-side: refuse to show recovered offers whose original `timeout_at` passed.

## 6. Status
Code changed: none. Tests: not run (no code changed). Deployed: nothing. Device tests: none.
