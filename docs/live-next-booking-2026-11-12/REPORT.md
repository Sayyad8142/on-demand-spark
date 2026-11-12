# Next Booking — preview preparation

## Decision
**GO for continued preview review; NO-GO for publishing or live activation.**
Live integration is explicitly OFF. No backend deployed, database modified, notification sent, booking created or APK published.

## Reported hook error
NOT REPRODUCED: `src/hooks/use-mobile.tsx` already imports `useState` and `useEffect` from React. The quoted instruction-like identifier is absent from that file. Latest preview diagnostics: build OK. No hook workaround was added.

## Audit and exact sources
- SOURCE: existing `supabase/functions/get-worker-leaderboard/index.ts` decodes JWT claims without verifying their signature, links by phone, and selects a fallback worker. It must not be used for new ranking. Its production parity remains NOT VERIFIED; existing Top Workers/Top Earners calls are preserved as requested, not endorsed as secure.
- LIVE SCHEMA/RLS: inspected `workers`, `worker_availability`, `bookings` columns and policies read-only. Workers may read only their own worker/availability rows, while admins have broader policies. No broad client reads or grants added.
- Proposed secure endpoint: `worker-availability-ranking`, independent of `worker-next-booking` and dispatch. Draft is in `staged/index.ts`, not the auto-deployment directory. It verifies Supabase authentication with `auth.getUser`, requires exactly one `workers.user_id` match, and refuses phone/fallback identities.
- Ranking fields: `workers.priority_score` descending, `workers.rating` descending, `workers.id` ascending internally as stable final tie-breaker. Zero values remain zero. Unknown scores or flags exclude the worker rather than invent data.
- Eligibility: `is_active=true`, `is_blocked=false`, `is_available=true`, `is_busy=false`; assigned community in `communities`, service in `service_types`; `worker_availability.day_of_week` (Sunday 0) and exact `slots` start `HH:mm:00`, interpreted in Asia/Kolkata. Current 30-minute interval is half-open.
- Busy: `bookings.worker_id` with any non-terminal status. Draft conservatively treats assigned pending/unknown statuses as busy. No booking details or OTP columns read. Terminal exclusions: completed, cancelled, rejected, failed, timeout. Final production status-contract review required before deployment.
- Assigned community slug array is authoritative; absent membership fails closed instead of trusting stale selected-community hints. Existing records needing fallback remain Unable to Verify pending backend review.
- Server reads are paginated; a size cap produces an error, never a truncated current ranking. Multi-query reads are not a transaction; slot rollover/slow reads refuse, but instantaneous cross-query state consistency is a remaining review consideration.

## Privacy and UI
Only rank, first display name, score, rating and `isMe` are exposed per row. No worker IDs, phone, token, photo, private schedules or customer details. Strict frontend validation rejects unexpected response fields. Community/service choices are limited server-side to the authenticated worker's memberships.

Next tab remains accessible even when the old leaderboard fails. Logged-in highlighting, scope selectors, slot, last update, availability reasons and empty state are implemented in English/Hindi/Telugu. Live integration OFF currently shows Unable to Verify, not invented worker data.

Refresh: 15 seconds while visible, immediate foreground/reconnect/own-availability events, next-slot timer, native foreground handling, own-worker RLS-scoped realtime subscription with cleanup. Production realtime publication is NOT VERIFIED; polling remains fallback. Errors, refresh and background remove current rows; owner/scope checks prevent account-switch leakage. Hung reads time out visually; underlying requests are not forcibly cancelled. No state is persisted.

## Verification
- PASS: full app regression, **55 files / 606 tests**.
- PASS: 38 targeted tests including 24 eligibility/contract tests, 10 mocked reader/lifecycle tests, 4 existing ranking tests; final hook rerun 10/10 after adding own-worker realtime wiring.
- PASS: latest preview build OK; reported hook diagnostic not reproduced.
- PASS: browser at 393×805 and 1280×1800, guest path with old-leaderboard failure intercepted: Next tab accessible, Unable to Verify, zero new live endpoint calls, no page errors or horizontal overflow. Settled screenshots under `/tmp/browser/live-next/`.
- NOT VERIFIED: authenticated real-worker response/UI, deployed sender authentication/privacy, actual cross-device availability realtime, real native phone transitions, successful live worker list. External unmanaged Supabase does not support injected authenticated end-to-end checks here. Mock tests do not establish hosted authentication settings.
- NOT VERIFIED: Deno deployment compilation/network adapter tests; core filtering/ranking draft is covered by Vitest, not a hosted service.

## Files changed
Existing: `src/components/BookingLeaderboard.tsx`, `src/i18n/locales/en.json`, `hi.json`, `te.json`, `roadmap.md` (root architecture-rule save attempted).

New: `src/components/NextBookingRanking.tsx`, `src/hooks/useNextBooking.ts`, `src/lib/nextBooking.ts`, `src/hooks/__tests__/useNextBooking.test.tsx`, `src/lib/__tests__/nextBooking.test.ts`, this report, `staged/core.ts`, `staged/index.ts`, and checksum source backups.

Top Workers/Top Earners ranking, assignments, acceptance, availability writes, dispatch, notifications, OTP, payments and production schema remain unchanged. Their failure display now leaves navigation usable.

## Required next gates
1. Separately approve secure-service deployment and review its production status/membership/auth contract; assess legacy leaderboard vulnerability independently.
2. Verify Deno adapter, unauthenticated/invalid JWT refusals, cross-account/community/service isolation, privacy allow-list and pagination on deployed service.
3. Separately approve activation; verify a named authenticated worker's ON/OFF/busy/slot and actual list through the UI, including all three languages and foreground transitions.
4. Only then consider publishing. No release or activation is authorized by this preparation.