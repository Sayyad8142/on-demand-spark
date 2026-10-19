# P0 — "Got reject fail" + missing device ACKs (19 Oct 2026)

Status: READ-ONLY audit done. Fix DRAFTED, NOT applied. Nothing deployed or published.

## 1. Exact cause of the reject failure (LIVE, verified from production logs)
- All 10 Reject calls in the last 3 days returned HTTP 400 (07:42–07:49 UTC today, 3 phones).
- Postgres error each time: `malformed array literal: "<worker uuid>"`.
- Source: `public._reject_booking_request_core`, statement
  `UPDATE booking_requests ... RETURNING worker_id INTO v_next_tier_workers` (a single uuid put into a `uuid[]`).
- It fires whenever the rejecting worker's tier is complete and another tier is waiting. Dispatch now gives each worker
  their own tier (booking 246301bc: order_sequence 1..7), so practically EVERY reject hits it.
- The error rolls back the whole transaction → offer stays `pending` → the re-offer sweep re-sends it to the same worker
  (explains "Admin Panel keeps sending the same booking"). Last successful reject: 05:04 UTC today.

## 2. Responsible file / function
- Backend: `_reject_booking_request_core` (called by both `reject_booking_offer` and legacy `reject_booking_request`).
- App message: the exact text "Got reject fail" is NOT in this repository (NOT VERIFIED — likely an older APK build).
  Current source shows "Couldn't reject. Please try again." then "Reject failed"
  (`BookingOverlayService.kt` reject handler, lines ~657–680 + `updateBooking` ~1126–1153).

## 3. Endpoints in use (LIVE logs)
- `POST /rest/v1/rpc/reject_booking_offer` — Android 16 SM-S911B (current APK).
- `POST /rest/v1/rpc/reject_booking_request` — Android 13 I2011, Android 15 V2521 (older APKs).
- Both authenticate with the worker JWT; both reach the same broken core. Not an auth / security-change failure.

## 4. Why ACKs are missing (LIVE)
- `ack-booking-delivery` returned 400 on all 37 calls in the last 24h. Deployed copy is the old build that only accepts
  `received`/`opened`; phones send `push_received`/`popup_shown` (known since the push-ack report, deploy still pending approval).
- Booking 246301bc: 7 offers, only `push_sent` + server timeouts recorded, zero device events.
- So "no device ack" / "unreachable" labels for these 7 workers are NOT proof they didn't receive the push.

## 5. Older APKs
- Reject: all versions affected; a backend-only fix restores them all (both RPCs share the core).
- ACKs: current APK protocol needs the corrected function deployed; older-APK ACK names NOT VERIFIED from APKs.

## 6. Proposed fixes
A (backend, P0): `001_reject_core_array_fix_DRAFT.sql` — one-statement change, same signature/grants/returns.
B (backend): deploy staged `ack-booking-delivery` (docs/ack-recovery, already approved-pending).
C (next APK, optional): avoid double toast; after a not-confirmed reject keep the popup open with Retry instead of closing;
   on timeout re-check offer status before retrying; remember confirmed-rejected offer ids to ignore duplicate pushes.

## 7. Tests (OFFLINE only, PGlite practice database — not live)
`reject_core.offline.test.ts`: 7/7 pass. Live version reproduces the exact error + rollback; fixed version confirms reject,
activates next tier (1 or several workers), last tier, repeat reject, already-accepted booking, other worker untouched.
Not run: device tests, scheduled/notification/slow-network cases (need a phone + test project).

## 8. New APK required? No for the reject fix. Optional for UX hardening (C).

## 9. Admin Panel/backend changes: A and B above. Admin Panel: treat `no_device_ack` as "unknown" while ACKs were down.

## 10. Deploy / rollback
Deploy A: run the DRAFT SQL (seconds, no data change). Verify: next worker Reject returns 200, `booking_requests.status='rejected'`,
no new "malformed array literal" in Postgres logs. Rollback: run `000_reject_core_LIVE_BACKUP.sql`.
Does NOT touch Accept, assignment, OTP, payments or payouts.
