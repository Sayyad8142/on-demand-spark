# Step B — Read-only investigation (2026-10-29)

## Permission cleanup (approved, executed)
Pre-check matched audit: start_otp_config had anon = TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; authenticated = SELECT + same four.
Ran: `REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.start_otp_config FROM anon, authenticated;`
After: anon = none, authenticated = SELECT only. booking_start_otps / start_otp_releases: no app rights.
Switch enabled=false (5 tries / 3s / 720 min). Bookings 960, flagged 0, codes 0, releases 0. Open: 1, started: 0.

## Findings
| Item | Result | Label |
|---|---|---|
| 11 Start OTP functions + 2 triggers on bookings installed, enabled | Yes | SOURCE (live catalog) |
| Helpers/key/service retrieval: service role only; verify/customer view/admin: signed-in only; anon: none | Yes | SOURCE |
| Vault secret `start_otp_encryption_key` exists (1 row, value not read) | Yes | SOURCE |
| Key actually decrypts/encrypts | Not exercised (only on first issued code) | NOT VERIFIED |
| `verify_start_otp(uuid,text)` derives worker from `auth.uid()` (same pattern as accept/reject) | Yes | SOURCE |
| Worker App calls edge function `verify-start-otp` → **404** (does not exist) | Mismatch | SOURCE |
| Reply contract mismatch: DB returns `{success, code: WRONG_CODE/LOCKED/NOT_ASSIGNED/INVALID_STATUS/CODE_UNAVAILABLE/EXPIRED/TOO_FAST/LEGACY_BOOKING/INVALID_FORMAT/UNAUTHORIZED, attempts_left, already_started}`; client expects `{ok, status}` + INCORRECT_OTP/NOT_AVAILABLE/UNAUTHENTICATED | Mismatch | SOURCE |
| Signed-in worker call end-to-end | Not run (no real bookings touched) | NOT VERIFIED |
| `service_get_start_otp(booking, customer_profile)` for User App backend (service role) | Installed | SOURCE; User App backend NOT VERIFIED |
| Deployed `complete-booking-with-otp` (401 unauth = live) completes after `started` | Write shape tested in harness only | PRIOR / deployed source NOT VERIFIED |
| End OTP unchanged (no change to its function, column, trigger) | Yes | SOURCE |

## Changes needed (PROPOSED, not done)
Worker App:
1. `src/lib/startOtp.ts`: replace `functions.invoke("verify-start-otp")` with `supabase.rpc("verify_start_otp", {p_booking_id, p_otp})`; map `success`/`already_started` → started; WRONG_CODE → incorrect (show attempts_left); LOCKED; NOT_ASSIGNED; INVALID_STATUS/CODE_UNAVAILABLE/EXPIRED → not available; TOO_FAST → "wait a moment"; UNAUTHORIZED → sign in; LEGACY_BOOKING → keep legacy End flow. Update tests.
2. Show Start button only when `start_otp_required = true` (add to `WORKER_BOOKING_COLUMNS`), not by global switch alone.
3. Add hi/te for TOO_FAST/EXPIRED messages.

User App:
1. Its own backend verifies the customer, then calls `service_get_start_otp` with service role; display Start code before start, End code only after `started`.
2. Never expose service role to the browser.

Backend deployment: **none required** (verification runs in the database). Optional: export deployed `complete-booking-with-otp` to confirm source.

## Risks
- Turning switch ON before Worker App rpc change + User App display = workers stuck (404 / customers have no code).
- Vault key untested until first issue.
- Pre-existing gaps unchanged: legacy direct completion, End code no attempt limit.

## Next steps
1. Approve Worker App change (rpc + mapping + flag gating) — switch stays off.
2. User App backend retrieval + display.
3. Export/check deployed End function.
4. Spare-phone test with switch ON for one test booking, then rollout.
