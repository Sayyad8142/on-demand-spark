# Worker App security corrections — 26 Nov 2026 (prompt-145)

Preview/source only. Nothing published; version numbers, dispatch, acceptance, OTP timings, earnings, pricing, payouts unchanged. Priority Score V2 and penalties stay off. Priority Score V2 and server-deadline OTP alarm changes preserved (no edits to those files).

## Completed (SOURCE + tests)
| Change | Where |
|---|---|
| `user_id` removed from every profile update; `id`/`user_id` stripped by `sanitizeWorkerUpdate` | `useWorkerProfile.ts`, `workerProfileColumns.ts` |
| Client self-link (`update({user_id})`) removed | `useWorkerProfile.ts` |
| Signup for a returning worker: `upsert` with `id`/`user_id`/`phone` replaced by `update` on the worker's own row id (also fixes a possible duplicate row when `user_id` = login but `id` ≠ login) | `OtpVerify.tsx` |
| Signup phone check reads only `id, user_id` of the matching row; fallback UPI/passbook fields are read only after the row is confirmed as this login's | `OtpVerify.tsx` |
| All `select('*')` on `workers` replaced with explicit lists | `useWorkerProfile.ts` (5), `OtpVerify.tsx`, `BookingDiagnostics.tsx` |
| Shared profile no longer loads FCM token, bank or provider (Cashfree/Razorpay) fields | `WORKER_PROFILE_COLUMNS` |
| Bank/UPI details load only on Account Details, own row, not cached | `AccountDetails.tsx` |
| Settings "FCM Token" row now uses token status, not the token | `Settings.tsx` |
| Own-row diagnostics screen keeps the token prefix it displays (needed), no bank fields | `BookingDiagnostics.tsx` |

Remaining direct `workers` reads were already explicit (e.g. `Earnings.tsx` reads `id, upi_id`; push/token hooks read token fields they need).

## Not changed — flagged
- Profile edit still writes `phone` (existing editable field). Conflicts with the "app never writes phone" rule; recommend Admin locks phone and the field becomes read-only. Needs your decision.
- New-worker signup still inserts its own row with `id`/`user_id` = login (only creation path until Admin's profile API exists).
- Heartbeat `last_active_at` own-row update kept (legitimate flow).

## Session-token audit of the currently published app (SOURCE)
| Request | Identity sent | Status |
|---|---|---|
| Web: all `supabase.rpc`, table reads/writes, `functions.invoke` | worker session JWT (supabase-js) | OK |
| Native `ack-booking-delivery` (push_received/popup_shown/worker_seen) | signed ack_token; else session JWT; **else anon key + `worker_id`** | RISK — last fallback |
| Native `worker-heartbeat` | session JWT + own worker_id; **legacy anon + worker_id when no fresh login stored** | RISK |
| Native `worker-boot-ping` | **anon key only** + stored ids | RISK |
| Native `worker-keepalive-ack` | **anon key only** | RISK |
| Native `report-missed-booking` | **anon key + `user_id` from prefs** | RISK |
| Native movement tracking (`MovementTrackingService.kt`) | to confirm with Admin endpoint | NOT VERIFIED |

Released builds will keep sending these until a new Android build ships; Admin must keep tolerating (but not trusting) them during migration.

## Prepared for Admin's secure APIs (no contracts invented, nothing activated)
Waiting on Admin for exact names/shapes of: verified profile + recovery, phone-registration check (replaces the `id, user_id` lookup — marked TODO in `OtpVerify.tsx`), bank/UPI update, heartbeat, device ACK, popup ACK, movement/location. When each is confirmed: one adapter per API, session JWT only, no worker_id, behind an OFF switch, legacy path kept until Admin confirms.

## Tests
- App: full vitest suite — see commit 1013 passed, 96 files (incl. 3 new profile-column tests + updated linkage tests).
- Native: `StartOtpAlarmRulesTest` 10/10 (JDK 21, unchanged since prompt-144).
- NOT RUN: Gradle compile, Robolectric, device tests — Android SDK download fails in this sandbox. Steps in `docs/android-build-readiness-2026-11-26/REPORT.md`.
- NOT VERIFIED: signed-in profile/Account Details/signup flows against the live database (no worker session here).
