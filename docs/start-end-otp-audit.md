# DIDI NOW Worker App — Start OTP & End OTP Audit (18 Oct 2026)

Read-only. Nothing changed, deployed or published. No booking, OTP or payout touched.
Evidence labels: SOURCE (code read), LIVE-READ (read-only query on production `paywwbuqycovjopryele`), TEST (automated, mocked), NOT VERIFIED.
No isolated test project and no device were available, so no writing test was run.

## Summary
- **End OTP (legacy)**: installed and working in live use — 258/258 completed bookings in the last 30 days have `otp_verified_at` (LIVE-READ).
- **Start OTP**: NOT installed. The app has the screen, but the backend it needs (`otp-v2-gateway`) is not in this project, and the database has no Start OTP column. The app switch is OFF, so workers never see it (SOURCE).
- **Critical security gap**: the database lets the assigned worker (and the booking's customer) mark a booking "completed" directly, without any OTP, and that fires the payout trigger (SOURCE + LIVE-READ policy/trigger definitions; not executed).

## A. Installation status
| Item | Result | Evidence |
|---|---|---|
| End OTP screen `src/pages/CompleteBooking.tsx` | PASS | SOURCE |
| End OTP function `complete-booking-with-otp` | PASS (deployed, used) | LIVE-READ completion data |
| `bookings.completion_otp`, `otp_verified_at`, `completed_by`, `completion_source` | PASS | LIVE-READ |
| Start OTP screen `src/pages/StartBooking.tsx` | PARTIAL (built, switched off) | SOURCE: `OTP_V2_CLIENT_ENABLED_DEFAULT = false` |
| Start OTP backend `otp-v2-gateway` | FAIL — not in project | SOURCE: no folder in `supabase/functions` |
| Start OTP storage (start code / hash / attempts) | FAIL — no column | LIVE-READ: only `completion_otp` exists |
| `resolve_mode` contract | PARTIAL — proposed only | `docs/otp-v2-resolve-mode-contract.md` |
| Live deployment of `otp-v2-gateway` | NOT VERIFIED | cannot list deployed functions from here |

## B. Setup status
- App ↔ End OTP backend: PASS (session token sent; server finds worker from the token).
- Database guards: PARTIAL — see F.
- Customer app (shows the code to customers): outside this project — NOT VERIFIED.
- Admin Panel completion (`admin_complete_booking_with_otp`): outside this project — NOT VERIFIED.

## C. Start OTP status — NOT VERIFIED / not operational
Client logic is sound (SOURCE + TEST): 4 digits required, button disabled until complete, double-tap lock, "started" only after confirmed server success, gateway down → nothing started, legacy answer → goes to completion. But there is no server to validate it, so correct/incorrect/expired/unauthorized cases cannot work end-to-end today.

## D. End OTP status
| Check | Result | Evidence |
|---|---|---|
| Correct code completes | PASS | SOURCE + LIVE-READ |
| Wrong code rejected | PASS | SOURCE |
| Empty/short code blocked | PASS | SOURCE (client + server length 4) |
| Wrong worker refused | PASS | SOURCE (403 when `worker_id` differs) |
| Cancelled booking refused | PASS | SOURCE (status not completable) |
| Duplicate completion | PASS | conditional update + idempotent replay |
| Duplicate payout | PASS (likely) | unique booking_id + idempotency key; 2 completion triggers + function all insert — relies on the unique key |
| End OTP before start | FAIL by design | `assigned`/`accepted`/`on_the_way` are completable — there is no start step |
| Start code reused as End code | N/A | no Start code exists |
| Attempt limit / lockout | FAIL | no counter; 4 digits = 10,000 guesses, unlimited |
| OTP expiry | FAIL | code never expires |

## E. UI status
- Buttons: `src/components/ActiveJobCard.tsx` — "Complete with OTP" (red) when legacy; "Start Booking" (blue) only when V2 is on; "Checking booking…" / "unavailable" safe states. SOURCE.
- Visible for all active statuses (assigned → started). SOURCE.
- Numeric keypad: `inputMode="numeric"`, auto-focus. SOURCE; on-device NOT VERIFIED.
- Loading, wrong-code shake, network error, success + payout card: present. SOURCE.
- OTP-pending banner after 60 min (`OtpPendingBanner.tsx`). SOURCE.
- Hindi/Telugu: labels wrapped with `displayText` (3/3 i18n tests pass). Server error texts from the legacy function (e.g. "Cannot complete booking in status: …", "No completion OTP has been generated…") are shown raw in English. LOW.
- Debug line "OTP length: · valid:" in `CompleteBooking.tsx:524` — confirm it is hidden for normal workers. LOW, NOT VERIFIED.
- Android screen sizes: NOT VERIFIED (no device).

Workflow today: accept → Active Job card → "Complete with OTP" → enter customer's 4-digit code → server checks → completed + payout card → Done → Home. There is no start step.

## F. Security status — FAIL
1. **CRITICAL — OTP bypass by direct update.** Policy `bookings_worker_update_assigned` gives the assigned worker UPDATE on their booking; `bookings_update_own_firebase` gives the customer the same. `enforce_booking_status_transition` allows assigned/accepted/on_the_way/started → completed. `guard_booking_completion_source` only checks the labels (`completion_source='otp'`, `completed_by='worker'`, `otp_verified_at` not null) — anyone allowed to update can simply write those labels. `guard_booking_sensitive_fields` does not protect status or those columns. Completion then fires `trg_create_worker_payout_on_completion`. Not executed (would write to production).
2. **HIGH — workers can read the customer's code.** `authenticated` has SELECT on `bookings.completion_otp`; worker read policies exist. The app avoids it (`WORKER_BOOKING_COLUMNS`), but a modified app can read it.
3. **HIGH — unlimited guesses**, no expiry (D).
4. **MEDIUM — filter injection pattern** in `complete-booking-with-otp`: `community` and `user.id` are put inside `.or(...)` text. `user.id` comes from a verified token; `community` from the booking row. Same pattern fixed in ack-booking-delivery.
5. **MEDIUM — platform fee falls back to 0%** when the community has no fee set, while project rules state 20%. Confirm which is intended.
6. **LOW — logs**: `[OTP_COMPARE]` logs lengths and a match flag (no values). Acceptable.
7. PASS: `worker_set_booking_status`, `auto_complete_assigned`, `test_complete_booking_system` are not callable by app users. `admin_complete_booking_with_otp` is callable by signed-in users — internal admin check NOT VERIFIED.

## G. Problems found
| # | Severity | Where | Fix (proposal, not applied) |
|---|---|---|---|
| 1 | Critical | bookings policies + `guard_booking_completion_source` | Block status→completed and changes to `completion_source/completed_by/otp_verified_at/started_at` unless the caller is service_role or admin |
| 2 | High | grant on `bookings.completion_otp` | Revoke column SELECT from `authenticated`/`anon`; worker reads already avoid it |
| 3 | High | `complete-booking-with-otp` | Attempt counter + lockout (e.g. 5 tries) and expiry |
| 4 | High | Start OTP | Build/deploy `otp-v2-gateway` + storage, or decide Start OTP is not required |
| 5 | Medium | `complete-booking-with-otp` `.or()` | Use two `.eq()` queries |
| 6 | Medium | fee fallback 0% | Confirm business rule |
| 7 | Low | raw English server errors; debug line | Map to translated messages; hide debug |

## H. Missing features
Start OTP backend and storage; attempt limits; expiry; completion only after start; translated server errors; lock on direct status writes.

## I. Verdict
- Start OTP: **NOT VERIFIED** (not operational — backend missing)
- End OTP: **PASS** functionally (live data), with High gaps
- UI: **PASS** in source; on-device NOT VERIFIED
- Backend: **FAIL** (bypass path)
- Security: **FAIL**
- Production readiness for "secure two-step OTP": **NO-GO**

## J. Next actions (need your approval)
1. Approve fix #1 (database guard) — highest priority; test first on an isolated copy.
2. Approve #2 (hide completion code column).
3. Approve #3 (attempt limit) in `supabase/functions/complete-booking-with-otp/index.ts`.
4. Decide on Start OTP: provide the `otp-v2-gateway` code (may live in another project) or confirm it should be built.
5. Device test on Android 10.0.02 in Hindi and Telugu.

Tests run: `bun run test` — 68/68 pass (mocked; includes 50 OTP V2 client tests). No live writes.
