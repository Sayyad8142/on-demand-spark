# Start OTP alarm audit — 23 November 2026

## Result

Alarm-only repairs are prepared in source. **Android phone playback is NOT VERIFIED.** No APK/AAB was generated or published; no production backend, countdown, OTP verification, dispatch, availability, login or payout code was changed.

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

## TEST — executed this turn

- `bun run test`: **799 tests passed across 72 files** (includes existing countdown, Start OTP and alarm contract coverage).
- Java 21 compilation + JUnitCore against the **actual native `StartOtpAlarmRules.java`**: **7 tests passed**. These cover the exact 10/15/20-minute boundaries, continuous mode, finite retry versus duplicate success, late reopening, verified versus incorrect OTP state, and cancellation eligibility.
- Preview build log: **build OK**; `use-mobile.tsx` already imports React hooks explicitly, and the quoted UMD-global diagnostic was not reproduced. No fake hook fix was applied.
- `git diff --check`: passed.

## NOT VERIFIED / remaining blockers

- Full Android test command was attempted with Java 21: `./gradlew :app:testDebugUnitTest --tests 'app.didisnow.worker.StartOtpAlarmTest' --tests 'app.didisnow.worker.StartOtpAlarmRulesTest'`. It stopped before compilation because the **Android SDK is absent**. New service-state/cancellation Robolectric regressions are retained in the project but **have not run**. Full Kotlin/Android compilation is therefore unverified this turn.
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