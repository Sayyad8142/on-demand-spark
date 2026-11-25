# Priority Score V2 (contract 2) + Start OTP deadline audit — 25 Nov 2026

## Live backend (VERIFIED, read-only query)
- `get_my_priority_score`: NOT deployed (no function in public or admin_private). App keeps the existing official score.
- `get_my_late_start_status`: deployed, contract_version 1, NO `deadline_rule_version`. Its `deadline_at` = accepted_at + 10 min for every booking type (old rule).

## Implemented (SOURCE + unit tests)
- `priorityScoreV2.ts`: strict contract_version 2 reader (components array or keyed object, max from `weights`, raw_score, penalty_deductions, performance_score, protection_adjustment, protected_dispatch_score, protection_ends_at, rating_display, penalties, v2_active, config_version). Any error/PGRST202/malformed → null → existing screen unchanged.
- Main V2 number = performance_score. Official only when `v2_active = true`; otherwise "Preview — not used for booking offers".
- Breakdown shows the 5 server numbers separately, four components, running penalties with recovery dates, protection end date, "New Worker" rating.
- Start countdown: instant uses server deadline_at; scheduled ignores server deadline_at until `deadline_rule_version >= 2` (keeps existing behaviour). `alarmPhaseFromDeadline` rule: first at deadline, second +5, continuous +10.

## Alarm audit (SOURCE)
- JS + native `StartOtpAlarmEngine`/`StartOtpAlarmRules` anchor on `accepted_at` (10/15/20 min). Stops on started_at, cancel, reassignment, non-eligible status; boot never blindly plays (unchanged, previously verified).
- GAP: for scheduled bookings accepted earlier than start − 10 min, alarms would fire before the service window. Live data (last 30 days, 58 Start-OTP scheduled): 0 accepted that early — dispatch sends ~10 min before start, so accepted+10 ≈ start time. Under the corrected rule (start + 10) today's alarms fire ~10 min early.
- Fix requires an Android build that reads the server deadline; NOT done (no version change, no publishing).

## Not verified
- Signed-in session, real booking, Android device, Robolectric. No UI screenshots captured this turn.

## Admin dependencies
1. Deploy `get_my_priority_score` (contract_version 2).
2. Add `deadline_rule_version` (2) to `get_my_late_start_status` with scheduled deadline = max(accepted, scheduled start) + 10 min.
3. Approve an Android build that anchors native alarms on that server deadline.

## Recheck after Admin install (25 Nov, 15:50 UTC) — VERIFIED read-only
- Project: paywwbuqycovjopryele (app .env and native host allow-list match).
- `get_my_priority_score` → `admin_private.psv2_my_score()`, contract_version 2. `psv2_state.score_mode = current` → v2_active false (preview). 0 V2 penalties.
  Live shape differs from the draft: component keys completed/rating/acceptance/otp with `max`; rating_display is a string ("New Worker" or "4.85"); penalties carry `active`/`reversed`; `new_worker_protected`, `computed_at`. Parser now accepts this shape.
- `get_my_late_start_status` → top-level deadline_rule_version 2; per booking `deadline_at` = scheduled: max(accepted, IST start)+10, missing schedule → null with `deadline_basis = unmeasurable_missing_schedule`; instant: accepted+10.

## Source changes
- Native `StartOtpAlarmEngine` reads `rpc/get_my_late_start_status` each reconcile; alarm anchor = deadline_at − deadline_minutes (`StartOtpAlarmRules.parseDeadlines`). Old rule / failed read → keeps last known rows (offline recovery unchanged). Null/unmeasurable → no alarm, no acceptance fallback.
- Timings (from prompt-143): one clip at deadline, continuous from deadline + 5 min; 20-minute trigger removed.
- Card: scheduled bookings show a countdown only with the server deadline; unmeasurable → no countdown and no Late Start warning.

## Tests
- App: 1009 passed. Native pure rules (JUnit, JDK 21): 10 passed incl. instant / scheduled early / scheduled late / missing schedule / old rule rejected.
- NOT RUN: Kotlin compile, Robolectric `StartOtpAlarmTest` (needs Android SDK), physical device: background/locked screen, restart, reboot, offline, duplicate prevention, cancel/reassign stop.
