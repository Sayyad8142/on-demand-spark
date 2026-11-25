# Start Booking card — final verification

Date: 25 November 2026. Request: prompt 142.

## Result

All available app regression tests and native Java alarm-rule tests passed. Small-screen isolated browser checks passed. No application behavior, app version, backend or release was changed. Nothing published.

The only additions are regression tests and this verification record. The reported use-mobile.tsx UMD-global error was not reproduced: that hook imports useEffect/useState explicitly, and the latest preview compilation reports **build OK**.

## Requested checks

| Check | Evidence and result |
| --- | --- |
| Progress follows the entire outer border | **VERIFIED — isolated browser.** The actual StartOtpCountdownCard renders an unfilled rounded SVG rectangle measuring button width minus 4px by 84px, inset 2px in an 88px button. Screenshots show the track surrounding all four sides, with progress shortening around that perimeter, not a separate horizontal bar. |
| Timer and border update each second | **VERIFIED — app integration tests and isolated browser.** The real ActiveJobCard advances 10:00 → 09:59 → 09:58 with consecutive one-second fake-clock advances. Browser observed 09:39 → 09:38 and changed SVG stroke-dasharray while running the real card with its display timer. |
| Green, orange, red | **VERIFIED — timer tests and isolated browser.** Green above 5 minutes; orange from 5 minutes through 2 minutes; red below 2 minutes. Distinct computed border colors and inspected screenshots at all three states. The button background deliberately remains green; border and timer supply the urgency colors. |
| Overdue continues past zero | **VERIFIED — app integration tests.** 00:01 → +00:00 → +00:02. **VERIFIED — isolated browser.** +01:15 → +01:16. Full red perimeter persists in overdue state. |
| Alarms at 10, 15, 20 minutes unchanged | **SOURCE + VERIFIED RULE TESTS.** No changes to the alarm engine, native wrapper, reminder functions or alarm rules in the redesign commit or this verification. Existing web alarm tests assert 600000/900000/1200000 ms milestones. Eight existing native Java tests passed against the actual StartOtpAlarmRules class. Physical audio playback and the Android engine tests are **NOT VERIFIED** here. |
| Entire card opens Start OTP | **VERIFIED — app integration tests.** Clicking the real ActiveJobCard Start action, including overdue, calls /start-booking/countdown-test. **VERIFIED — isolated browser.** Tapping the border, title and timer each calls the same Start handler; overdue taps also work. The actual signed-in Start OTP destination is **NOT VERIFIED**. |
| No reset after reopen | **VERIFIED — app integration tests.** Remount using unchanged acceptance time at 11m15s yields +01:15. **VERIFIED — isolated browser.** Reload keeps the acceptance timestamp: 09:39 → 09:38 → reopened 09:37, and overdue remains overdue. Physical native background/resume or process restart is **NOT VERIFIED**. |
| Complete with OTP unchanged | **SOURCE + VERIFIED app integration tests.** The redesign did not alter ActiveJobCard's completion button. Unflagged bookings and server-confirmed started bookings still call /complete-booking/countdown-test, with no Start countdown. Existing OTP safety tests also passed. No real completion or payout was performed. |
| Small Android screen sizes | **VERIFIED — Chromium viewport simulation, not a device.** 320×568, 360×640, 393×805 and 640×360 landscape. English, Hindi and Telugu checked at 320px. All four buttons remain 88px high, no horizontal overflow, no browser errors. In short landscape view, remaining states are reachable by vertical scrolling. |

## Test results

- `bun run test`: **92 files, 984 tests passed**, including five new real ActiveJobCard integration tests. Complete suite rerun after correcting the test fixture and translation mocks.
- Java 21 + JUnit 4.13.2: existing `StartOtpAlarmRulesTest`: **8 tests passed**. Actual production rules were compiled alongside their existing test; no substitute rules.
- Latest automatic preview check: **build OK** (15:16:19 UTC). The temporary test-fixture typing error was corrected before the successful check.
- Browser: six viewport/language combinations, real card/timer modules in an isolated temporary preview; no page errors. Screenshots inspected for English, Hindi, Telugu and landscape.

## Honest pending checks

1. **NOT VERIFIED — signed-in Home → a real accepted booking → Start OTP screen.** The project's externally managed Supabase login does not allow the available session tool to mint a worker session. No credentials requested, no fake worker/login supplied, and no production booking created.
2. **NOT VERIFIED — Android engine/Robolectric tests.** Android SDK is not configured; Java-only rule tests are not a substitute for testing the Android service and player.
3. **NOT VERIFIED — installed Android device.** No physical device or adb is available: actual alarm audio at 10/15/20 minutes, background/foreground behavior, process reopen, and native card-to-OTP navigation remain device checks.

No source findings required an app change. No publish, app version change, dispatch change, OTP authorization change, payment change or payout change was made.