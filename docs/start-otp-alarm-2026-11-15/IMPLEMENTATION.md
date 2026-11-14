# Start OTP alarm implementation — source/test only, no deployment

## Implemented
- Native single media player with alarm audio attributes, bundled “OTP, OTP, OTP” clip; finite 10/15-minute clips and continuous looping from 20 minutes, with no two-hour cutoff.
- Timing comes from server acceptance and HTTP server Date anchored to Android monotonic elapsed time; assignment alone no longer starts the timer.
- Foreground media-playback service, persistent notification, five-minute temporary silence; no volume/DND override, exact-alarm permission respected with inexact fallback.
- Read-only verified-session own-worker booking reconciliation before start, on events/resume/connectivity, and once per minute only while service is active. Serialized/coalesced reads; no booking/OTP/payment writes.
- Immediate booking-scoped stop on server-confirmed Start success event, cancellation/reassignment/completion event or existing cancellation push; logout silence precedes network cleanup. Tombstones prevent late reads restoring ended bookings within the login session.
- One earliest-accepted booking selected, one player, completion speech yields while Start is pending. Old local schedules removed; reboot invalidates old clock and never replays missed finite clips.
- Existing backend cancellation integration reused; no backend source modified or deployed, no real notification sent, no APK/AAB published. Hook error not reproduced; hook's named imports unchanged.

## Verified
- All 641 app tests passed, including 14 new alarm-contract tests.
- Android Kotlin/Java compilation and 66 native tests passed, including 14 new timing/eligibility/cancellation/account/boot/silence tests.
- Automated tests verify decision/state behavior, not physical audio, actual Android alarm delivery or a signed-in production booking end-to-end.
- Preview build log remains OK; generated Android packages removed after every test run.

## Device/platform limitations — release remains unverified
- Android 12+ may refuse a foreground-service start from a background alarm, particularly without exact-alarm permission; notification fallback is retained. Doze can delay inexact 10/15/20 milestones. No claim of exact locked-phone timing.
- Android 15+ prohibits media-playback foreground service launched from BOOT_COMPLETED. Boot shows a reminder notification only when saved candidates exist; reopening triggers fresh eligibility checks before restoring audio. A powered-off/force-stopped phone cannot continuously play audio.
- Offline active playback retains last-known eligible state, with five-minute silence. Cold/boot restoration requires fresh server state and does not blindly restore audio. New bookings cannot be learned offline.
- Reads use the existing stored Supabase session; expired credentials in a long-closed app can prevent background reconciliation until normal app session refresh. Existing cancel pushes remain the closed-app stop path; hosted sender parity/device receipt is not established.
- Updated server state stops audio when received. While offline, the phone cannot know a remote cancellation/verification; while closed online, a missed cancel push is backed by the service's minute reconciliation, not a guaranteed immediate receipt.
- Real-device acceptance → 10/15 clips → 20 loop → wrong OTP unchanged → correct OTP silence, plus cancellation/reassignment, foreground/background/lock/DND/notification refusal, two-hour survival, offline/reconnect/silence, account change, process restart and reboot must be checked on an approved isolated phone.
- Authenticated end-to-end checks unavailable for this external/unmanaged Supabase project; no credentials requested or worker account chosen.

## Local Android follow-up
Update the local project from the connected repository, then run `npx cap sync` before compiling/testing the new native code. Read Lovable's Capacitor mobile-app guide before device setup. No store release or production deployment is approved.