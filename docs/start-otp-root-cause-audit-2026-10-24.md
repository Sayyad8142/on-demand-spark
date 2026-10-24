# Start OTP Root Cause Audit — 24 Oct 2026 (read-only)

Nothing changed, deployed or published. Labels: CONFIRMED (code read or live read-only query), SUSPECTED, NOT ACCESSIBLE.

## 1. User App root cause — NOT ACCESSIBLE
The User App is a separate project; its code cannot be read from here.
- CONFIRMED (database): there is only one code per booking, `bookings.completion_otp`. It is created by trigger `trg_enforce_server_completion_otp` when the booking row is written, so it exists from the start. There is no Start code column. The customer app can therefore only show one code, and it is available right away.
- SUSPECTED: the User App shows `completion_otp` from assignment onward with no status check. WhatsApp sharing could send this code before work is done. Needs checking in the User App project.

## 2. Worker App root cause — CONFIRMED
- `src/lib/otpV2.ts:39` `OTP_V2_CLIENT_ENABLED_DEFAULT = false`. With this switch off, `getOtpCardAction` in `src/components/ActiveJobCard.tsx:76` returns `"complete"` for every active status, so the red "Complete with OTP" button (line 371) shows right after acceptance.
- The "Start Booking" button (line 388) and the Start screen `src/pages/StartBooking.tsx` exist, but they appear only when the switch is on. `StartBooking.tsx:57` sends the worker back to completion while it is off.
- The Start screen calls `verifyStartOtp` → edge function `otp-v2-gateway`, which does **not** exist in `supabase/functions/` (only `complete-booking-with-otp`). Turning the switch on today would show "Checking booking…" or "unavailable", not a working start.
- After a successful start, the app goes Home and refreshes the card (event `bookingStarted`). It never sets the status locally. The Start step was never tested end to end.

## 3. Backend issue — CONFIRMED
- No Start code: `bookings` has `completion_otp`, `otp_verified_at` and `started_at`. There is no start code, hash, attempt count or expiry.
- No Start-code function. Public functions with OTP in the name are only `admin_complete_booking_with_otp`, `enforce_server_completion_otp`, `log_otp_reminder_event` (plus the unrelated `start_booking_tip`).
- Status `in_progress` is not used. The lifecycle uses `started`. Live counts: 0 `in_progress` bookings, 0 bookings with `started_at` set.
- Completion is allowed from `assigned`/`accepted`/`on_the_way`/`started` (see `docs/start-end-otp-audit.md`).
- **Conclusion: Start OTP is entirely missing on the server.** On the Worker App it is built but disconnected.

## 4. Files and functions
Worker App: `src/components/ActiveJobCard.tsx` (getOtpCardAction, buttons 358–391), `src/pages/StartBooking.tsx`, `src/pages/CompleteBooking.tsx`, `src/lib/otpV2.ts`, `src/lib/otpCompletionFlow.ts`.
Backend: `supabase/functions/complete-booking-with-otp/index.ts`; triggers `trg_enforce_server_completion_otp`, `trg_guard_booking_completion_source`, `enforce_booking_status_transition`, `trg_create_worker_payout_on_completion`; policies `bookings_worker_update_assigned`, `bookings_update_own_firebase`, `bookings_update_admin_authenticated_only`.

## 5. Lifecycle
```text
Current:  assigned -> (worker enters completion code any time) -> completed -> payout
Required: assigned -> start code verified -> in_progress -> completion code verified -> completed -> payout
```

## 6. Missing work
- Backend: start code storage (hashed), creation at assignment, verify-start function (moves status to started/in_progress), completion allowed only after start, attempt limits and expiry for both codes, a database lock against direct status writes.
- Worker App: switch on after the backend exists; map the new status; translate server messages.
- User App (NOT ACCESSIBLE): show the Start code while the booking is assigned or the worker is on the way; show the Completion code only after the job has started; check WhatsApp sharing.

## 7. Security — CONFIRMED from policy and trigger definitions (not executed)
| Check | Result |
|---|---|
| Separate Start/Completion codes | FAIL — only one code |
| Checked on the server | PASS for completion (edge function) |
| Worker can bypass the code by direct status update | FAIL — `bookings_worker_update_assigned` + `guard_booking_completion_source` only checks the labels (`completion_source='otp'`, `completed_by='worker'`, `otp_verified_at` not null), and the caller can write those labels themselves |
| Customer can mark the booking completed | FAIL — `bookings_update_own_firebase`, same label-only guard |
| Expired code rejected | FAIL — no expiry |
| Guessing limited | FAIL — no attempt counter (10,000 combinations) |
| Two requests at once | PASS for completion (conditional update) |
| Completion only after start | FAIL |
| Duplicate payout | PASS (likely) — unique booking_id on payouts |
| Workers can read the customer's code | FAIL — column readable by `authenticated`; the app avoids it, a modified app would not |

## 8. Impact on active bookings and payouts
Live: 0 bookings currently active. A later change must leave current bookings in "legacy mode" (completion only), as `resolve_mode` / `LEGACY_BOOKING` already plans. Payout trigger and unique key must stay as they are.

## 9. Recommended fix order
1. Database lock: only the server/admin may set status to completed or started and set the completion labels. Test on an isolated copy first.
2. Hide `completion_otp` from app users.
3. Backend Start code: storage, creation, `otp-v2-gateway` (resolve_mode, verify_start, verify_completion) with limits and expiry; bookings that already exist stay legacy.
4. User App: show the right code for each stage; check WhatsApp sharing.
5. Worker App: turn on `OTP_V2_CLIENT_ENABLED_DEFAULT` after 3 and 4; test on a phone in en/hi/te.

## 10. Fix first
Backend (Admin Panel / Supabase owner): steps 1–3. Then the User App. The Worker App goes last, because its part is already built and only needs switching on.
