# Start OTP not showing — investigation (2026-11-03, read-only)

## Latest booking
- ID `c149ba52-eab3-4142-a5cd-d398d8137490`, instant, bathroom_cleaning
- Created 12:13:52 UTC, assigned 12:14:16 UTC, status `assigned`
- Worker `033f9766-…` — reports app_version 10.0.03 (build_number column empty, so build 103 is inferred from version only)
- `start_otp_required` = **false**
- Start OTP rows for this booking: **0** (0 in the whole table)
- `start_otp_config.enabled` = **false** (unchanged since 2026-10-28)

## Root cause
The global switch is OFF. The insert guard copies `start_otp_config.enabled` into
`start_otp_required` at booking creation, so this booking was created unflagged.
The issue trigger skips unflagged bookings, so no code was generated. The Worker App
(ActiveJobCard / StartBooking) only shows "Start booking with OTP" when the flag is true,
so it correctly showed "Complete with OTP". Not a Worker App version problem and not a
User App problem.

The flag is locked after insert (guard reverts any change), so turning the switch ON now
will NOT convert this booking. Only bookings created after the switch is ON are flagged.

## Flow check (source, live DB)
- Generation on assign: `zza_start_otp_issue_on_assign` → `_issue_start_otp` — OK (flagged only)
- Regeneration on reassign: issues new code when worker_id changes; deletes when unassigned — OK
- Worker screens: button by server flag; End OTP screen redirects flagged+unstarted to Start — OK
- `verify_start_otp`: session worker, 4 digits, assigned worker only, attempts/lock/TTL/throttle, sets `started` — OK
- Bypass prevention: `aab_start_otp_bookings_guard` blocks `started` without verified code and blocks non-admin completion before `started` — OK
- End OTP: `trg_enforce_server_completion_otp` enabled; unflagged bookings unchanged

## Answers
1. Root cause: switch OFF at creation time → booking unflagged → no code.
2. Database switch. Not the booking flag logic, not the app version.
3. Minimal fix: no code change. Admin turns `start_otp_config.enabled` ON, then creates a NEW booking.
4. Yes — the current booking can finish with the existing End OTP.
5. Yes, for every worker who may receive flagged bookings. Only 1 of 39 workers reports 10.0.03.
6. Not for a general switch-on. The switch is global: every new booking gets flagged, and
   workers on older builds (10.0.02 ×25, 10.0.01 ×5, 7.x ×5, 6.0.64 ×3; 16 ON now) may not be
   able to start them, and the guard then blocks completion.

## Recommendation
- Current booking: GO — continue with End OTP.
- Global switch ON: NO-GO until workers receiving bookings are on 10.0.03.
- Controlled test: CONDITIONAL GO only in a quiet window where the 10.0.03 worker is the only
  one ON (or the test booking is admin-assigned to them), switch ON → create one booking →
  verify → switch OFF immediately. Rollback for any flagged booking: `admin_release_start_otp`.
