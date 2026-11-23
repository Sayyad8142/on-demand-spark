# Start OTP alarm audit — 23 November 2026

## Result

Alarm-only repairs are prepared in source. **Android phone playback is NOT VERIFIED.** No release APK/AAB was built or published; no production backend, countdown, OTP verification, dispatch, availability, login or payout code was changed.

## SOURCE audit

| Requirement | Existing source behavior / finding |
|---|---|
| 10-minute alarm | First finite clip at server acceptance +600,000 ms. |
| 15-minute alarm | Second finite clip at +900,000 ms. |
| 20-minute continuous alarm | One looping native player from +1,200,000 ms, without an upper duration cutoff. |
| Reopen | Reads server acceptance and server Date; monotonic elapsed time preserves the deadline. Missed finite clips more than 90 seconds late are intentionally not replayed. A pending booking reopened after 20 minutes resumes continuous mode after the server read succeeds. |
| Countdown coexistence | The card and alarm use the same server acceptance timestamp. The card does not authorize, start or stop audio. |
| OTP success | Existing server-confirmed `bookingStarted`/Start events cancel the booking's alarm. Incorrect codes do not cancel. |
| Remote stop | Dedicated `START_OTP_REMINDER_CANCEL` already cancels native audio. Ordinary cancellation/reassignment pushes previously cleared offers but did **not** directly cancel this player; they depended on the WebView/server polling. |
| Duplicate playback | One account-scoped service/player, one selected booking, stable milestone markers and serialized server reads. |
| Background/lock | AlarmManager wakeups, wake-lock-backed MediaPlayer, media-playback foreground service and notification are present. Android permissions and platform restrictions still determine delivery. |
| Voice asset | Existing `start_otp_voice.mp3` is bundled and readable (3.468 seconds). Prior documentation describes an “OTP, OTP, OTP” clip; its exact spoken content and physical audibility were not independently verified in this audit. No replacement audio generated. |

## Repairs prepared

1. Ordinary cancellation **and** reassignment push paths now also retire the booking's native OTP alarm without requiring a live Home screen. Existing offer-release behavior is unchanged.
2. A queued foreground-service start is no longer recorded as successful playback. The actual player acknowledges success only after `MediaPlayer.start()` succeeds.
3. The next milestone is armed before permission/service failures can return. Failed startup has a 30-second retry watchdog; finite clips retain the existing 90-second no-late-replay limit. Successful playback restores the next milestone timer; a healthy continuous player cancels the watchdog.
4. Failed audio is released immediately. An audio error removes only its own playback marker, permitting bounded finite retry; one player prevents concurrent OTP clips.
5. A queued service intent checks the current booking queue/phase/silence state before playback, so cancellation or account changes cannot revive a retired booking.
6. Timer broadcasts now hold a `goAsync` pending result during reconciliation, release it after evaluation (including failures/account changes), and enforce a nine-second broadcast deadline. Previously the receiver returned while all server reads were still pending, allowing Android to reclaim its process.
7. Follow-up sweep: empty queues now clear the pending notification even without a valid server clock; failed `stop()` cannot skip player release; completion reminders yield across this worker's jobs, and native Start playback preempts already-running completion OTP speech without stopping cancellation speech.

## Follow-up SOURCE inventory — each listed path was read

Rule: the worker's pending Start OTP uses acceptance-based 10/15/20-minute milestones, one non-overlapping player, and booking-scoped stops on confirmed Start/end; reopening never resets the deadline.

| Screen / flow / job / function | Code read | Verdict |
|---|---|---|
| Home active booking / countdown / Start button | `Home.tsx`, `ActiveJobCard.tsx`, `StartOtpCountdownCard.tsx`, `bookingCardDetails.ts`, `startOtpReminder.ts` | Same acceptance timestamp; display-only, no audio scheduling; unchanged. |
| My Bookings history | `Bookings.tsx` | Only completed/cancelled rows; does not schedule alarms. Settled records and payouts unchanged. |
| Start OTP entry, success, wrong OTP, legacy/V2 branches | `StartBooking.tsx`, `startOtp.ts`, `startOtpAlarm.ts` | Confirmed success emits booking-scoped stop; wrong OTP does not. Authorization unchanged. |
| End OTP / completion / return to Home | `CompleteBooking.tsx` guards and completion event paths | Pending flagged Start redirects to Start; confirmed completion events stop by booking ID; unchanged. |
| Global manager on every signed-in route, realtime, resume/reconnect | `App.tsx` reminder mount/listeners, `StartOtpReminderManager.tsx`, `useActiveJob.ts` | Shared account-scoped manager; stop events and refreshes wired. No screen-specific second Start scheduler. |
| Completion reminder banner/popup/voice | `useOtpReminderEscalation.ts`, `OtpPendingBanner.tsx`, `otpReminderVoice.ts`, `App.tsx` listeners | Per-row suppression missed a different pending Start; repaired shared poll arbitration. Legacy 60/10-minute cadence unchanged. |
| Native completion TTS versus Start media | `CancellationVoicePlugin.java`, `StartOtpAlarmService.kt` | Existing speak-time guard did not stop already-running completion speech; repaired proactive OTP-only preemption and failed-player release. Cancellation speech preserved. |
| Logout / account transition | `AuthContext.tsx` sign-out path; manager cleanup; engine configure/stopAll | Native stop precedes network logout cleanup; queue cleared on account change; unchanged. |
| Native overlay Accept and separate notification/activity Accept | `BookingOverlayService.kt` confirmed-success block, `BookingAlertActivity.kt` acceptance block | Both wake shared engine only after confirmed acceptance; dispatch/Accept behavior unchanged. |
| Foreground/tapped cancellation and reassignment; closed-app pushes | `native/push.ts`, `lib/fcm.ts`, `MyFirebaseService.java` handlers, `StartOtpReminderCanceller.java`, `BackendSync.kt` identity resolver, MainActivity registration/broadcast references | Ordinary end pushes now retire native queue; dedicated cancel checks login UID (despite resolver's old worker-ID comment), matching sender UID. No identity/auth change needed. |
| Native timer, retry, continuous playback, notification silence | `StartOtpAlarmEngine.kt`, `StartOtpAlarmRules.java`, `StartOtpAlarmReceiver.kt`, `StartOtpAlarmPlugin.kt`, `native/startOtpAlarm.ts` | One queue/player; retry/cancel guards repaired. Empty queue no longer posts a pending alarm with an invalid clock. Permissions/silence unchanged. |
| Reboot/update and token recovery jobs | `StartOtpAlarmReceiver.kt`, `BootReceiver.kt`, `FcmBootSyncWorker.kt` | Alarm clock invalidated on reboot; no automatic boot media service; token recovery does not schedule separate Start audio. |
| Cancellation screen / browser cancellation voice | `BookingCancellationActivity.java`, `cancellationVoice.ts`, `App.tsx` cancellation listeners | Separate cancellation audio; ordinary native end push now stops that booking's OTP player before cancellation presentation. Unrelated cancellation features unchanged. |
| Practice Start/End OTP | `TestBooking.tsx`, `practiceBooking.ts`, practice notification references | Local practice state/1234 does not invoke real OTP or Start alarm scheduling; example data unchanged. |
| DB Start verifier | `20261028130323_...sql` `verify_start_otp` definition | Repo SOURCE updates server `started_at` only after correct code; wrong code does not. Hosted definition not verified; no DB changes. |
| DB stop trigger and sender | `20261103205645_...sql` `notify_start_otp_reminder_cancel`, `send-fcm/index.ts` reminder payload branch | SOURCE sends booking-scoped stop to old worker on verified Start/end/reassignment; data-only payload with server UID. Hosted deployment/delivery not verified; no edge file edited. |
| Admin delayed/urgent flag cron | Same migration's `refresh_start_otp_flags`; `adminFlagLevel` helper | SQL uses acceptance **or assignment**; helper/phone are acceptance-only. This is Admin follow-up timing, not the phone audio timer; left untouched because backend/settings changes are outside this request. |
| Android registration / manifest / packaging | MainActivity plugin-registration block, app manifest, `capacitor.config.ts`; normal Gradle test guard output | Plugin registered, media/wake/exact permissions present and unchanged. Normal packaging remains blocked by stale bundled web assets. |

## PRIOR tests — initial audit

- `bun run test`: **799 tests passed across 72 files** (includes existing countdown, Start OTP and alarm contract coverage).
- Java 21 compilation + JUnitCore against the **actual native `StartOtpAlarmRules.java`**: **7 tests passed**. These cover the exact 10/15/20-minute boundaries, continuous mode, finite retry versus duplicate success, late reopening, verified versus incorrect OTP state, and cancellation eligibility.
- Preview build log: **build OK**; `use-mobile.tsx` already imports React hooks explicitly, and the quoted UMD-global diagnostic was not reproduced. No fake hook fix was applied.
- `git diff --check`: passed.

## TEST — follow-up sweep

- Full app suite: **805 tests passed across 73 files**, including cross-booking completion suppression and restoration after verified Start.
- Temporarily supplied Java 21 / Android SDK under `/tmp` without project settings changes. Kotlin and Java Android code compiled successfully.
- Full native unit suite: **81 tests passed across 9 suites**, including **29 alarm tests**. Cancellation without a clock, queued-start retirement, audio-error retry, failed-player release and native completion-speech preemption are covered using JVM/Robolectric state tests.
- Command: `ANDROID_HOME=/tmp/android-sdk-121 ./gradlew :app:testDebugUnitTest -x :app:verifyWorkerWebAssets` (Java 21 supplied externally). **Only the asset guard was excluded for native unit testing; the release guard itself was not edited, and no release was packaged.** These tests do not verify current web assets inside an APK or physical sound/FCM delivery.
- The normal, unmodified Gradle test path was attempted first and refused stale Android web assets. A local current web build + Capacitor sync is still required before any usable test/release APK.

## NOT VERIFIED / remaining blockers

- Initial missing-SDK blocker was resolved for native-only compilation/tests using temporary tools; **normal Android packaging remains blocked by stale web assets**. No release APK/AAB or upgraded installation was verified.
- No attached Android device, current signed APK or unmanaged signed-in worker session is available. Foreground/background/locked-screen sound, genuine FCM receipt, countdown-to-alarm integration and immediate physical silence are **not device verified**.
- Android 12+ background foreground-service starts can be refused; denied exact-alarm access/Doze can delay delivery. Notification fallback and retry cannot bypass these restrictions. Exact locked-screen timing is not guaranteed.
- The receiver-lifetime repair still needs Android lifecycle testing. Its nine-second bound does not guarantee that three slow server requests finish before Android's deadline; poor connectivity/platform background restrictions can still prevent a cold alarm delivery.
- While closed, a missed remote-stop push relies on the audible service's **60-second** server reconciliation, not guaranteed immediate receipt. Offline/expired-session phones cannot learn remote cancellation instantly. No backend sender was edited or deployed.
- Existing user-facing “Silence 5 minutes” action temporarily pauses even continuous playback; preserved intentionally. Reboot clears the old clock and waits for foreground/server validation rather than blindly restoring audio. Force-stop/power-off cannot guarantee alarms.

## Required local/device verification before release

1. Update your local project from the connected repository, rebuild the current web assets, then run `npx cap sync`; do not sync stale assets. Run the Android tests above in an Android-SDK-equipped environment before building/installing a signed test APK.
2. On an approved isolated real booking, record server acceptance time and observe one clip at 10 minutes, one at 15 minutes, and non-overlapping continuous playback at 20 minutes. Check with Home/countdown open, background and screen locked, including Doze.
3. Reopen before/after each milestone and after 20 minutes; verify no timer reset or duplicate finite clip. Incorrect OTP must leave reminders pending. Confirmed Start OTP must immediately silence the player and remove its alarm notification.
4. Deliver ordinary cancellation, reassignment and dedicated stop pushes with the WebView closed; confirm immediate receipt-to-silence and no later revival. Repeat stops and cancel while a service start is queued.
5. Exercise notification/exact-alarm refusal, playback failure, offline/reconnect, expired session, process death, reboot and five-minute silence; document actual limitations instead of treating automated test success as phone verification.

Read Lovable's Capacitor mobile-app guide before native setup/testing.