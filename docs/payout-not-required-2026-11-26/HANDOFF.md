# Bookings without payout details — Admin/backend handoff (PROPOSED, NOT DEPLOYED)

Owner decision (2026-11-26): workers who have not entered payout details must still receive and accept bookings.

## Done in Worker App (SOURCE)
- `src/services/bookingAlertCoordinator.ts`: removed the `payout_ready !== true` check that hid incoming offers.

## Still blocking on the server (verified live / in source)
1. DB `public.accept_booking_authoritative` — refuses with "Please add valid bank details before accepting bookings" when `payout_ready` is not true. **Remove that IF block.**
2. Edge `send-fcm` (line ~127) — skips workers with `payout_ready !== true` (`payout_not_ready`). **Delete that skip.**
3. Edge `notify-next-tier` (line ~74) — `.eq("payout_ready", true)` filters next-tier workers. **Drop the filter.**
4. Edge `get-pending-worker-bookings` (line ~63) — returns `pending: []` when not payout-ready. **Delete that early return.**

Payouts themselves are unchanged: Cashfree transfers still need a valid UPI/beneficiary; earnings simply wait until the worker adds details.
Edge functions were NOT edited from this project (saving them auto-deploys to production).
