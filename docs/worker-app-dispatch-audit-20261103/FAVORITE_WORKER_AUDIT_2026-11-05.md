# Favorite Worker Offer & Acceptance Audit — 2026-11-05 (READ-ONLY)

Labels: LIVE = read from production DB; SOURCE = repo code; NOT VERIFIED = no evidence.

## Live functions
- `notify_workers_fcm()` (trigger on bookings INSERT, instant only): if preferred worker is active, available, not busy, right service + community → inserts `booking_requests` row with `timeout_at = now()+60s`, status pending/queued. Otherwise clears `preferred_worker_id` (silent normal dispatch).
- `sweep_preferred_timeouts()` cron `* * * * *`: after timeout_at (or on reject/not_delivered/lost once timeout passed), clears preferred_worker_id, logs `preferred_worker_fallback`, calls `private.dispatch_kick`.
- `try_accept_booking(id)` → `accept_booking_authoritative(id, NULL)`: session identity; active/not blocked/payout/available; booking `FOR UPDATE`; reservation guard (others refused while preferred timeout_at > now); must have been offered; busy check; conditional UPDATE `worker_id IS NULL AND status='pending'`. authenticated/anon have NO direct execute on the 2-arg function.

## Live data
- 1,016 bookings; 3 currently carry preferred_worker_id (all won by favorite; assigned in 6–28 s). 3 fallback events total (1 in last 30 days). Favorite rows that fell back lose preferred_worker_id, so history lives only in booking_events.

## Results
| Area | Result | Note |
|---|---|---|
| Offer created for favorite | PASS (LIVE) | trigger, instant only |
| Scheduled bookings favorite | NOT VERIFIED / likely FAIL | trigger returns early for non-instant |
| Distinct payload/flag | FAIL (SOURCE) | normal BOOKING_ALERT, no preferred marker |
| Push sending of favorite offer | NOT VERIFIED | row queued; which sender pushes it not in DB source |
| Full-screen/sound | Same as normal offers (overlay + loud ringtone; no full-screen intent) |
| Window start | FAIL (LIVE) | starts at row insert, not push send or receipt; network delay eats into it |
| Window length | PARTIAL | 60 s nominal, actual 60–120 s (minute cron); last live 62 s |
| Countdown accuracy | FAIL (SOURCE) | phone uses send-fcm expires_at (now+60 at send), not request timeout_at; OfferTimer clamps min 5 s |
| Reject → immediate fallback | FAIL (LIVE) | sweep only acts after timeout_at; reject waits out window |
| Others blocked during window | PASS (LIVE) | accept guard refuses others |
| Normal dispatcher skip during window | PARTIAL | backup skips when an active request exists; live booking-notifications not verified to check preferred |
| Eligibility: blocked | FAIL (LIVE) | trigger doesn't check is_blocked (accept does) |
| Eligibility: slots | FAIL (LIVE) | trigger doesn't check availability slots |
| Eligibility: FCM token / payout | FAIL (LIVE) | not checked; unreachable favorite holds booking ≥60 s |
| Eligibility: busy | PARTIAL | relies on is_busy flag; accept does real active-booking count |
| Worker goes OFF/busy after offer | PASS at accept (refused); booking still waits for timeout |
| Accept identity & race | PASS (LIVE) | session-derived, row lock, conditional update |
| Late accept | PARTIAL | favorite can still accept after 60 s until sweep clears it (up to ~60 s more); allowed only while booking pending |
| Duplicate taps | PASS-ish | native single-flight; retry after lost reply returns "already assigned" (not idempotent success) |
| After accept OTP | PASS (LIVE/SOURCE) | same start_otp_required / verify_start_otp / completion guards |
| Duplicate offers from separate dispatchers | NOT VERIFIED | no atomic dispatch claim |

## Recommended fixes (not implemented)
- P0: Add is_blocked, payout_ready, valid FCM token and slot checks to favorite trigger (skip straight to normal dispatch if unreachable).
- P0: Favorite reject → clear preferred + dispatch_kick immediately.
- P1: Start the 60 s at push_sent (or send timeout_at as expires_at in the payload) so countdown matches server.
- P1: Sweep more often (e.g. 10 s) or enforce timeout_at for the favorite in accept.
- P1: Decide scheduled-booking favorite behaviour.
- P2: Idempotent "already yours" on repeat accept; preferred flag in payload for analytics; keep preferred history column.

Verdict: PARTIALLY WORKING.
