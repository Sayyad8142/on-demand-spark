# Canonical acceptance + favorite-v1 status — 24 November 2026

Status: **PREPARED in Worker App source; backend NOT changed; nothing published.**

## SOURCE — what the app now does
- Every acceptance path (web Home/coordinator, App deep link, native Activity, Overlay service, tray tap → Activity) calls only `try_accept_booking` with `{p_booking_id}`. The staged `accept_booking` switch is removed on web (`offerAcceptanceContract.ts`) and native (`OfferAcceptanceContract.java`). No new grant is needed.
- favorite-v1 parser (`src/lib/favoriteOfferStatus.ts`, native `OfferAcceptanceContract.favoriteDeadline`): requires `contract_version: "favorite-v1"`, matching `booking_id`/`request_id`, `offer_generation` ≥ 1, known `status`, boolean `actionable`, ISO `expires_at` (original expiry) and `server_time`. Actionable on a closed/expired offer is refused. Deadline = phone now + (expires_at − server_time), never later than the deadline the phone already holds.
- Accept answer: an additive `offer` block that is valid and not actionable closes the offer (`offer-closed`) instead of retrying. Success is still decided only by `success`.
- Deadline recovery (web `recoverOfferDeadline`, native `OwnOfferPreflight`) uses `get_my_offer_status` only when `FAVORITE_V1_STATUS_ENABLED` is turned on; any failure gives no actionable offer (no legacy fallback). OFF today: the existing own-row read is unchanged.
- Kept: original-expiry countdowns, generation-specific rejection cleanup, durable replay dedupe, single-flight claim, truthful receipt/popup acknowledgments.

## Compatibility with 10.0.05 (105) — SOURCE (git `4d18c8fb`)
10.0.05 web and native call `try_accept_booking` with only `p_booking_id` and read `success` / `error` / `message`. The staged hardening keeps the name, argument, grant and keys; it adds `offer` and `idempotent`. Its new expiry error text "This offer has expired" is already classified as closed by 10.0.05 (`/expired/`). Effect on 10.0.05: late taps after the original expiry are refused (today a 90-second grace exists only for non-open rows — open expired rows currently pass).

## Admin dependencies (PROPOSED — `try-accept-hardening.sql`)
1. Confirm favorite-v1 field names/values (or send corrections before activation).
2. Apply hardened `try_accept_booking` (strict expiry under lock, lock order booking→worker→request, idempotent re-accept).
3. Add `get_my_offer_status` + `_favorite_v1_offer`; then the app flag can be enabled in a later release.
4. Certify that operating hours, approval, payout, availability, eligibility, favorite reservation and assignment rules are unchanged (they remain in `accept_booking_authoritative`).
5. Leave `accept_booking` without a worker grant (unused) and resolve the worker UPDATE policy on `booking_requests` (F2).
6. `atomic_accept_booking` is still executable by logged-in workers and reaches `accept_booking_authoritative` without the strict expiry check. No Worker App build calls it (checked source and 10.0.05). Route it through the hardened checks or remove the worker grant, otherwise a hand-made request can still accept an expired offer.

## NOT VERIFIED
Physical phone flows (locked screen, app killed, background, reconnect, two phones racing), authenticated end-to-end acceptance against the hardened backend, Play-installed 10.0.05 behavior (only its source was checked).

## Sweep — every Accept path (SOURCE, read this turn)
| Path | Endpoint / expiry |
|---|---|
| Home offer hook (`useUnifiedBookingAlerts` → `tryAccept`) | try_accept_booking; original deadline + request id |
| App deep link (`App.tsx` → `tryAccept`) | same |
| Web FCM / realtime / poller (`fcm.ts`, coordinator → `recoverOfferDeadline`) | no Accept of its own; recovery via the shared reader |
| Native Activity + Overlay service | `OfferAcceptanceContract.rpc()` after `OwnOfferPreflight` |
| Native FCM receiver, Activity/Overlay reopen (`OfferTimer.recover`) | shared `OwnOfferPreflight` |
| Tray notification | opens the Activity; no direct Accept action |
| Database: `try_accept_booking` | app endpoint; hardening staged |
| Database: `accept_booking` | not executable by workers; unused |
| Database: `atomic_accept_booking` | executable by workers, unused by the app, no strict expiry — item 6 |
