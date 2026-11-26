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

## Worker App follow-ups (SOURCE, done)
- `Home.tsx`: offer listeners, backup poller and alerts no longer wait for payout_ready; ON switch no longer shown as "not ready"; payout card now says bookings work, details are needed only to get paid.
- `src/lib/workerReachability.ts` still lists `payout_not_ready` because it mirrors today's server; remove after items 1-4 are deployed.

---
## REVERSED by owner (2026-11-26, later the same day): bank details ARE required for bookings
Do **not** remove the four server checks above — they must stay. The Worker App again hides offers, stops listening and refuses ON when `payout_ready` is not `true` (re-read from the server at tap time).
Admin follow-up: `set_worker_payout_ready` still marks a worker ready with only a UPI ID. Under the new onboarding (Cashfree IMPS, bank only), `payout_ready` should mean "bank beneficiary ready" — see `docs/worker-onboarding-imps-2026-11-26/ADMIN-DEPENDENCIES.md`.
