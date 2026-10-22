# Worker Focus receiver — approval handoff (2026-10-22)

Status: STAGED + TESTED OFFLINE. NOT DEPLOYED, NOT MIGRATED, sync still OFF
(`DIAGNOSTICS_SERVER_SYNC_ENABLED = false`), Worker App not published.

## 1. Is the earlier delivery-confirmation fix working? (VERIFIED live, read-only)
- Device confirmations resumed 2026-10-22 05:39 UTC after 8 days of zero: 6 popup_shown,
  16 worker_seen, from 6 workers (legacy-name fallback in phones that have the new build).
- `push_received` still 0 in `booking_offer_events`; receipts land only in
  `booking_requests.push_delivered_at` (16 in 2 days). Cause: deployed receiver is still the OLD build.
- Conclusion: PARTIALLY operational. Full fix needs the corrected `ack-booking-delivery`
  (docs/ack-recovery/staged) deployed — still NOT deployed.

## 2. Reuse decision
- Same auth pattern as the secure ACK receiver (Firebase ID token, worker resolved server-side).
- Delivery evidence is NOT duplicated: Admin view reads `booking_offer_events`/`booking_requests`.
- Heartbeat data reused from `workers.last_heartbeat_at`; receiver does not touch heartbeats.
- A separate function is used (not folded into `ack-booking-delivery`) so diagnostics can never
  break booking confirmations.

## 3. Contract — `POST /functions/v1/report-worker-diagnostics`
Headers: `Authorization: Bearer <Firebase ID token>`, `apikey: <anon>`.
Body: `{ "events": [ { "id": string(≤200), "kind": snapshot|network_lost|network_restored|explicit_logout|push_registration_failed|push_token_refreshed|notification_permission, "observed_at": ISO UTC, "data": { flat string|number|boolean|null } } ] }` (≤50).
Snapshot `data` fields used for status: network, notification_permission, token_registered, slot_state, app_version, session_state.
Responses: 200 `{ acceptedIds, rejected:[{id,reason}] }` · 400 events_required / too_many_events · 401 unauthorized · 403 worker_not_found · 405 · 500 store_failed / status_failed / internal.
Rules: client worker_id ignored; observed_at within now−7d..now+5min; token-like string keys refused;
duplicates ignored (unique worker_id+event_id); status updated only if newer (`upsert_worker_diagnostic_status`).
The phone removes only `acceptedIds` from its queue → safe retry.

## 4. Admin Panel
Tables (admin-read via `has_role`): `worker_diagnostic_events`, `worker_diagnostic_status`.
Proposed `admin_worker_focus()` (§3c of docs/worker-focus-diagnostics-handoff-2026-10-22.md) joins them with
workers, worker_availability and booking_offer_events. Display: ≤45 min "Connected", ≤6 h "Last seen …",
older "Device unreachable — reason unknown" — never "switched off". Show `observed_at` beside every value. IST display.

## 5. Tests (run here)
- Receiver: `docs/worker-focus/staged/handler.test.ts` 16/16 pass (auth, forged worker_id, dedupe,
  delayed-older-never-wins, no availability/booking/payout writes, malformed input, limits, token refusal, app format).
- Worker App: 151/151 pass.
- NOT VERIFIED: real Firebase verification, real SQL function, Admin Panel, real phones (only backend is production).

## 6. Older app versions
Older builds never call this endpoint → no effect. Current build queues locally only. Nothing changes for them.

## 7. Needs approval / production steps
1. Apply `staged/001_worker_diagnostics_DRAFT.sql`.
2. Deploy receiver (copy handler + Firebase-verifying entry point to `supabase/functions/report-worker-diagnostics`).
3. Deploy corrected `ack-booking-delivery` (separate approval).
4. Add the sender in the app and flip `DIAGNOSTICS_SERVER_SYNC_ENABLED`, then build/publish.
5. Build Admin Panel view.
