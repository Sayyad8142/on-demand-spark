# Worker App combined-fixes report

Preview/source changes only. No production deployment, database mutation, live booking, notification send or APK release was performed.

## Issue status

| Issue | Status | Root cause and correction |
|---|---|---|
| Start OTP retry limits | PARTIAL: display fixed; live server NOT FIXED | SOURCE + live read-only inspection: verifier enforces cumulative attempts/locked_at. Removed tries-left display and corrected wrong-code wording. Proposed replacement is staged in `staged/verify_start_otp.sql`, not applied. Live LOCKED responses remain respected; client cannot override them. |
| Home booking loading | SOURCE FIXED; authenticated end-to-end NOT VERIFIED | SOURCE: per-mount local state and loading on each fetch caused blank gaps. Shared account-keyed memory cache now renders cached booking while refreshing silently. Server realtime updates cancel older reads before updating cache; cancellation/completion clears matching card. Unknown first-load still waits safely. |
| Individual extra charges | SOURCE FIXED; real-account UI NOT VERIFIED | SOURCE: dish and surcharge amounts were combined into generic Extra. Positive stored dish, surge, surcharge and glass amounts now display separately with icons. Existing earnings calculation unchanged; no hardcoded charge amounts. |
| Ten-minute Start OTP countdown | SOURCE FIXED; device NOT VERIFIED | SOURCE: no one-second countdown existed. Uses accepted_at, else assigned_at, sharing reminder basis; clamps at zero with delayed warning. OTP remains available; no cancellation/reminder/admin change. |
| Physical Activity setup | SOURCE FIXED; device NOT VERIFIED | SOURCE: request ran after booking acceptance and inside monitoring. Optional onboarding now owns prompt; monitoring only checks. Denial/skip does not block bookings; granted/not-required avoids another request. |
| Android availability speech | SOURCE FIXED; phone audio NOT VERIFIED | SOURCE: asynchronous Android engine could report unavailable before initialization; stop clears dependency callbacks, leaving JS speech pending. Added readiness retries, stopped-call settlement and bounded timeout. Actual Android dependency exercised with simulated engine voices for en-IN, hi-IN, te-IN. Plugin already linked; no native plugin/config upgrade needed. |
| Battery Later button | SOURCE FIXED; device NOT VERIFIED | SOURCE: Later was unconditional. Removed it, re-check OS on startup/return, automatically continue on grant, offer explained safe continuation after failed settings attempt. No simulated grant; existing snooze remains fallback only. |
| Small layout issues | SOURCE adjustments; visual sign-off NOT VERIFIED | Charge rows and long button labels wrap; onboarding spacing reduced without redesign. No screenshots supplied beyond written brief. Browser could not reach actual signed-in screens. |

## Verification performed

- PASS: 571 app tests across 53 files, including actual useActiveJob cached remount, realtime accept/start/completion, account isolation and OTP-secret exclusion.
- PASS: regression tests for 600-second server-time countdown, restart continuity, delayed state, positive stored charges, zero/absent components, permission helpers, native speech readiness/stop, and repeated OTP retries with server-authoritative outcomes.
- PASS: 45 Android unit tests, including three tests executing the community Android TTS implementation with simulated English/Hindi/Telugu voices, speak/stop/shutdown checks. These do not establish installed phone voice availability or audible output.
- PASS: Android Kotlin/Java compilation and debug APK assembly. Generated APK/build files removed after tests to satisfy repository size limit. No downloadable/installable APK retained and no signed release produced; existing web asset packaging/installed phone build not verified.
- PASS: latest automated preview log reports `build OK`. Reported use-mobile TS2686 was NOT REPRODUCED: file already has named React imports, browser module transform returned HTTP 200. No unnecessary hook edit.
- PASS: all 21 original-source backup checksums match manifest.
- NOT VERIFIED: authenticated end-to-end. External unmanaged Supabase cannot supply managed session. Browser reached loading screen; isolated card injection did not produce a usable rendered card, so no visual/card-flow claim is made.
- NOT VERIFIED: staged SQL execution/rehearsal. It retains session-derived worker, booking/OTP row locks, assignment, status, code format/hash, expiry and minimum five-second server throttle; removes cumulative lock. Must be independently reviewed/tested in an isolated database before approved migration.

## Remaining gates

1. Review, isolate-test and separately approve the staged verifier before removing live server lock. Never present this source-only work as unlimited production retries.
2. Authorized signed-in staging account: accept → Home immediately → wrong OTP retries at allowed interval → correct OTP → started read-back → completion/cancellation removes card; verify true charge records and earnings.
3. Physical Android: install approved signed test build with refreshed web assets; grant/deny/reopen activity and battery settings, unsupported exemption return, granted permissions not prompted again, cold start/resume countdown.
4. Hear English/Hindi/Telugu speech with installed voice packs, absent-language fallback, tap stop, repeat, navigation/background stop; verify no overlapping audio.
5. Keep production release, dispatch changes and live sends unapproved. Earlier roadmap items remain blocked on their named separate approvals/devices.

Evidence: `evidence/` contains app test logs, Android compilation/unit-test logs and JUnit XML. Backups: `backup/sha256.json` plus original files.