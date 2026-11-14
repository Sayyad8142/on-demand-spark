# Start OTP voice reminder — read-only audit

Audit time: 14 November 2026, approximately 23:02–23:04 UTC (15 November IST).

## Scope and reported error

No application code, configuration, database records, notification settings or production behavior was changed. No notifications were sent, and nothing was deployed or published. Only this report and the task tracker were written.

The reported `src/routes/__root.tsx(3,12)` error is **NOT REPRODUCED**: this React/Vite project has no `src/routes/__root.tsx` or `src/routes` directory, and the quoted phrase is absent from the inspected source/configuration. The earlier mobile hook already imports `useEffect` and `useState` correctly. Opening `/home` in the current preview redirected to `/auth`, with no Vite error overlay or browser page errors. This confirms the public preview renders, not an authenticated booking flow or a full TypeScript check. No current build-errors log was available. A source fix or invented Window declaration is not warranted for a nonexistent property/file. The exact failing source/build output would be needed to diagnose a different checkout.

## Evidence labels

- **SOURCE**: current repository or installed Capacitor dependency; not proof of installed APK behavior.
- **LIVE READ**: aggregate read-only production SQL, with no OTP values, tokens or personal records selected.
- **TEST**: existing isolated automated tests, not physical-phone tests.
- **NOT VERIFIED**: no device, signed-in worker flow, hosted function download or playback evidence available.

## Executive finding

The Start OTP system schedules **23 local Android notification sounds**, nominally at 10 minutes after acceptance/assignment and every 5 minutes through minute 120. The bundled clip transcribes as **“OTP, OTP, OTP”** and lasts about **3.468 seconds**. It does not say the code digits or “please enter OTP.”

It is **not a guaranteed loud alarm**. The channel uses Android **notification** audio, not the alarm-volume TTS system. Android idle restrictions, missing exact-alarm permission in the inspected manifests, disabled notifications, stale offline booking state and reboot replay prevent a reliability PASS.

There is a separate **End/completion OTP** spoken popup starting at 60 minutes and repeating every 10 minutes, with no count/duration cap in its source. It must not be confused with Start OTP reminders.

## Required behavior table

Statuses rate the requested operational behavior, not just whether a constant exists.

| Check | Actual behavior | Status |
|---|---|---|
| First reminder timing | SOURCE/TEST: `accepted_at`, falling back to `assigned_at`, plus 10 minutes. Not creation, arrival or scheduled service time. Only future offsets more than one second away are scheduled. Android exact delivery unproven. | PARTIAL |
| Repeat interval | SOURCE/TEST: 5-minute offsets. Capacitor documents idle delivery as at most once per 9 minutes per app; exact 5-minute idle playback cannot be promised. | PARTIAL |
| Maximum reminder count | SOURCE/TEST: 23 planned IDs per booking; not 23 confirmed audible plays. Hash collisions and restore behavior are caveats. | PARTIAL |
| Maximum reminder duration | SOURCE: last nominal reminder at minute 120. Boot restoration can replay overdue stored notifications beyond 120 minutes. | FAIL |
| Voice message | Bundled MP3 transcription: “OTP, OTP, OTP.” No actual digits. Notification body separately says “Please collect and enter the customer's Start OTP.” | PASS |
| Supported languages | One bundled clip and fixed English notification title/body; no Start-reminder Hindi/Telugu selection or translation found. | PARTIAL |
| Sound volume | Android `USAGE_NOTIFICATION`; follows channel/device volume, no forced loudness or DND bypass. | FAIL |
| Background playback | Native alarm receiver posts notification without a running web screen; delivery/audio not tested on a phone. | NOT VERIFIED |
| Locked-phone playback | Wakeup alarm and public channel visibility exist; idle timing and actual sound depend on OS/device settings. | NOT VERIFIED |
| Offline handling | Already scheduled reminders need no internet; failed reads retain schedule. Offline cancellation/start updates cannot reliably stop old reminders. | PARTIAL |
| Stop after Start OTP | Server `started_at` removes eligibility; JS event/realtime/resume refresh and backend cancel push exist. No on-fire server check; offline/closed app can remain stale. | PARTIAL |
| Stop after cancellation | Successful refresh or booking-scoped cancel push removes pending timers. Delivery and immediate sound-stop unproven. | PARTIAL |
| Duplicate prevention | Stable booking/index IDs plus per-effect running guard. No global audible queue; reboot moves all missed alarms to the same time; finite hash can collide. | PARTIAL |
| Backend reliability | LIVE READ: cancel trigger enabled; flag cron active every 5 minutes, 288 successful runs in preceding 24h. Notification delivery/audio not evidenced; hosted sender parity unknown. | PARTIAL |

## Full nominal timeline

Time zero = valid server `accepted_at`; only if null, valid `assigned_at`. An invalid non-null acceptance timestamp does not fall back. Device `Date.now()` is compared with server timestamps, so phone clock error shifts actual timing.

| Reminder | Minutes after clock start |
|---|---:|
| 1 | 10 |
| 2 | 15 |
| 3 | 20 |
| 4 | 25 |
| 5 | 30 |
| 6 | 35 |
| 7 | 40 |
| 8 | 45 |
| 9 | 50 |
| 10 | 55 |
| 11 | 60 |
| 12 | 65 |
| 13 | 70 |
| 14 | 75 |
| 15 | 80 |
| 16 | 85 |
| 17 | 90 |
| 18 | 95 |
| 19 | 100 |
| 20 | 105 |
| 21 | 110 |
| 22 | 115 |
| 23 | 120 |

Each eligible future slot schedules one notification using the approximately 3.468-second clip; no TTS three-repeat loop is attached to these slots. Android may mute, delay or throttle them. Normal reopening at minute 32 plans minute 35 onward; missed slots are not backfilled by the app planner. **Reboot restoration differs:** the installed Capacitor receiver rewrites each overdue saved alarm to approximately 15 seconds after restore, potentially posting many together and beyond the two-hour boundary. This is SOURCE evidence, not observed phone playback.

## Flow, eligibility and stop behavior

1. `StartOtpReminderManager` is mounted inside `src/App.tsx`; it runs only on native platforms with a signed-in user.
2. Resolve worker by `workers.user_id`, then legacy `workers.id` fallback. Read at most 20 own bookings, fields `id,status,worker_id,start_otp_required,started_at,accepted_at,assigned_at`.
3. Eligible: assigned to that worker, `start_otp_required === true`, no `started_at`, status one of `assigned`, `accepted`, `on_the_way`, valid acceptance/assignment timestamp.
4. Diff wanted IDs against local pending storage; cancel stale IDs and schedule missing future IDs with `allowWhileIdle:true` and channel `start_otp_reminder_v1`.
5. Android AlarmManager → `TimedNotificationPublisher.onReceive` → notification channel plays its bundled sound. Receiver does not re-read booking/session/eligibility before posting and deletes a fired one-shot record from storage.
6. Re-sync on mount, resume, `bookingAccepted`, `bookingCancelledAlert`, `startOtpVerified`, and worker-filtered booking realtime. There is no periodic Start-reminder polling or reconnect-specific handler in this manager.
7. Server changes to `started_at`, `status`, `worker_id` invoke `notify_start_otp_reminder_cancel`, requesting a cancel push for the old worker; it also resolves admin flags. Native `MyFirebaseService` routes `START_OTP_REMINDER_CANCEL` to `StartOtpReminderCanceller.cancel`.
8. Canceller matches notification extras by reminder kind and booking ID; cancels AlarmManager intent, removes saved records and dismisses visible notifications. It does not run a dedicated active audio-player stop. Already fired records are removed by the receiver, so later pending-storage scans cannot necessarily dismiss an already posted notification.

| Transition | Intended/source cancellation | Limitation |
|---|---|---|
| Successful Start OTP | Server `started_at` ends eligibility; event refresh; server cancel push | Not immediate if read/push unavailable; no proven audible-stop receipt |
| Cancelled/completed/expired/closed | Any status outside the three allowed statuses ends eligibility | A timestamp/deadline passing alone does not stop it unless status changes; offline stored alarms remain |
| Reassigned/another worker takes over | Worker mismatch; server targets old worker for cancellation | Filtered realtime removal behavior untested; native cancel push needed while app closed |
| Logout | No-user effect calls `cancelAllReminders()` | Async/in-flight schedule race; cleanup itself does not cancel all timers |
| Account switch | Effect re-runs | `workerIdRef` is not reset on user change; cached identity may prevent correct cancellation/scheduling |

The sync `running` flag drops a concurrent event rather than queuing a follow-up refresh. A status change during a read/scheduling operation can therefore leave stale alarms until another event/resume. Cancellation checks occur before the pending/diff phase, not before every later awaited schedule call; logout can race a schedule already in progress. These are SOURCE risks, not reproduced incidents.

## Phone conditions

| Condition | What can be established |
|---|---|
| App open | Local native notification path exists; no Start-reminder web TTS or `localNotificationReceived` voice handler found. Actual audible play NOT VERIFIED. |
| Background/process removed normally | OS alarm receiver can post without JS; not equivalent to user force-stop. Actual device behavior NOT VERIFIED. |
| Locked | Wakeup alarms requested; Doze and channel rules still apply. NOT VERIFIED on device. |
| Silent mode | Notification audio can be muted. No loud override in this Start-reminder path. |
| Do Not Disturb | No channel bypass configured; not guaranteed audible. Native TTS plugin comments about alarms do not prove DND bypass and concern another flow. |
| Force-stopped | No implementation bypasses Android stopped-app restrictions. Do not promise delivery until reopened; no phone test. |
| Internet disconnected | Previously scheduled local clip can post; new schedules need a successful booking read; server stop push may be delayed/lost. |
| Phone switched off/rebooted | No sound while powered off; dependency restore can replay missed alarms together after restore/unlock. |

The app requests general push notification permission elsewhere, but this manager neither checks its channel health nor exact-alarm settings. Inspected app/plugin manifests contain no exact-alarm permission. Installed merged APK settings were not inspected. OS channel settings are persistent/user-controlled; recreating the same ID cannot be treated as restoring sound or permissions.

## Backend and real-booking evidence

Production read-only aggregates at audit time:

| Evidence | Result | Meaning |
|---|---:|---|
| Start-flagged bookings, all present / last 30 days | 93 / 93 | Flag is not proof a reminder was scheduled |
| Flagged with worker and acceptance/assignment timestamp | 69 | Clock-bearing candidates; historical eligible status duration not proven |
| Flagged with server `started_at` | 3 | Start recorded, not proof reminders stopped on phone |
| Starts at least 10 minutes after acceptance/assignment | 2 | Delay occurred, not proof sound played |
| Currently unstarted eligible bookings already past 10 min | 0 | No currently delayed eligible booking in this snapshot |
| Admin flag rows | 52, all resolved; 12 reached urgent | Administrative tracking, not delivery tracking |
| Flag resolutions | 6 cancelled, 45 completed, 1 OTP verified | Resolution is server evidence only |
| Late-start bookings with OTP-resolved flag | 1 of 2 | Flag begins at 20 min, so not all 10-min delays produce a flag |
| Cancel notification log rows | 42 across 42 bookings | Cancellation push logs, NOT reminder sounds |
| Cancel logs marked `fcm_status=success` | 42 | FCM/server send success recorded; not device delivery |
| Cancel logs delivered/opened timestamps | 0 / 0 | No such confirmations recorded; not proof of failure |
| `otp_reminder_events` | 0 rows | This table is written by separate completion reminder source, not Start local scheduler |
| OTP/reminder-named delivery events | 0 rows | No explicit matching delivery evidence found in queried table |
| Start flag cron, last 24h | 288 succeeded | Active every 5 min, not repository migration's every-minute schedule |

**Unknown:** historical count truly eligible for Start reminders, how many local alarms scheduled, fired or delivered, how many clips played aloud, how many device schedules stopped after verification, and real duplicate/late playback count. There is no dedicated Start scheduler/playback receipt path in inspected code; phone pending storage and logs were unavailable. Four `BOOKING_REMINDER` log rows were also found but cannot be attributed to Start OTP audio.

LIVE READ confirms enabled trigger and cancellation function features (HTTP request, old-worker target, start/reassignment checks, caught exceptions). The function uses the existing public-key sender call; hosted `send-fcm` implementation/authentication parity was **NOT VERIFIED**, and no endpoint was invoked. Repository sender shows data-only high-priority cancellation with two-hour TTL and session UID added as `worker_uid`; this remains SOURCE, not verified hosted behavior.

Admin flags are independent: `refresh_start_otp_flags` marks delay after 20 min, urgent after 2h and resolves on state/worker changes. Current cron is five-minute cadence; the checked migration says one minute. These flags do not play audio or prove delivery. The current function's conflict handling does not reopen resolved rows and updates worker only while newly escalating an unresolved row to urgent; reassignment/repeated eligibility can therefore leave incomplete follow-up history.

## Separate completion reminder — important distinction

`useOtpReminderEscalation` polls every 30 seconds while JS runs, first checks after 5 seconds, and uses `accepted_at + 60 minutes` plus 10 minutes since last shown. Statuses: accepted, confirmed, on_the_way, started, in_progress; stop field is `otp_verified_at`, **not** Start's `started_at`. There is no Start-required filter or two-hour/count cap. It can apply to an accepted flagged booking still waiting for Start OTP and overlap the Start notification sound around minute 60 onward.

It emits `otpReminderAlert`; `App.tsx` displays a popup and calls `otpReminderVoice.ts`, saying **“OTP, OTP, please enter OTP.”** three times with 600ms gaps. Web fallback is English `en-IN`, volume 1 relative to device output. Native `CancellationVoicePlugin` uses alarm audio and attempts approximately 85% alarm volume, restoring it afterward. Its failure fallback is the **booking-cancellation** clip, not Start OTP audio. Its completion callback does not reset the JS singleton, so later calls can remain suppressed until `stopOtpReminderVoice` is called. These concerns belong to the separate flow and were not changed.

## Issues ranked by severity — findings only, no proposed fixes

### High

1. **Stale alarms can continue after start/cancellation/reassignment** while offline or cancellation push unavailable; receiver never revalidates the booking. `StartOtpReminderManager.sync`, `TimedNotificationPublisher.onReceive`, `notify_start_otp_reminder_cancel`.
2. **Reboot can replay many missed alarms together, even after two hours.** `LocalNotificationRestoreReceiver.onReceive` changes every overdue saved notification to now +15s without Start-specific deadline/eligibility checks.
3. **Guaranteed loud / exact cadence is unsupported.** Notification audio respects user settings; exact-alarm configuration not present in inspected manifests; documented idle quota exceeds five-minute interval. `ensureChannel`, `NotificationChannelManager.createChannel`, `LocalNotificationManager.setExactIfPossible`.
4. **Account/logout and concurrent-update cancellation risks.** Stale worker ref, dropped sync events and in-flight async scheduling can retain obsolete alarms. `StartOtpReminderManager` effects, `resolveWorker`, `sync`.

### Medium

5. **No authoritative scheduled/delivered/played/cancelled phone receipts.** Production successes cannot substantiate sound playback; existing tests cover pure rules only.
6. **Two OTP reminder systems can overlap.** Different start times/stop fields/caps and audio streams; native completion speech fallback can say cancellation instead. `useOtpReminderEscalation`, `otpReminderVoice`, `CancellationVoicePlugin.playFallbackOnce`.
7. **Finite hash / weak dedupe boundary.** Booking hash modulo 40 million can collide; notification IDs do not include acceptance generation or schedule time; same ID with changed target time is retained by `diffReminders`. No global multi-booking audio queue. `bookingHash`, `reminderNotificationId`, `diffReminders`.
8. **Partial operational visibility.** Twenty-row query limit without ordering, phone-clock comparison, no reconnect retry/poll, swallowed failures/no channel-health confirmation; cron source/live mismatch and resolved-flag re-entry limitations.
9. **Pending-only cancellation may miss already posted sound/notification.** One-shot record deleted on fire; neither JS pending scan nor native canceller has a dedicated active audio stop.

## Exact responsible files/functions

| File | Functions / role |
|---|---|
| `src/lib/startOtpReminder.ts` | `acceptanceMs`, `isReminderEligible`, `reminderOffsetsMin`, `planReminders`, `bookingHash`, `reminderNotificationId`, `diffReminders`, `adminFlagLevel` |
| `src/lib/startOtp.ts` | `START_ALLOWED_STATUSES`; server Start RPC client |
| `src/components/StartOtpReminderManager.tsx` | `ensureChannel`, `pendingReminderIds`, `cancelAllReminders`, `resolveWorker`, `sync`; action navigation |
| `src/App.tsx` | Mounts Start manager; separate completion popup/voice lifecycle |
| `android/app/src/main/res/raw/start_otp_voice.mp3` | Bundled 3.468s mono MP3; transcription “OTP, OTP, OTP” |
| `android/app/src/main/java/app/didisnow/worker/MyFirebaseService.java` | `onMessageReceived` cancel routing |
| `android/app/src/main/java/app/didisnow/worker/StartOtpReminderCanceller.java` | `cancel` booking-scoped alarm/storage/notification cancellation |
| `android/app/src/main/java/app/didisnow/worker/BackendSync.kt` | `resolveWorkerId` returns stored session UID for cancel identity comparison |
| `supabase/migrations/20261103205645_489a5a9d-a572-4e1b-a1f8-3f208b9032df.sql` | Source flag table, functions, cancellation trigger and proposed minute cron; not proof of hosted parity |
| `supabase/functions/send-fcm/index.ts` | Repository sender cancellation branch; hosted parity NOT VERIFIED; not edited or invoked |
| `node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.java` | `triggerScheduledNotification`, `setExactIfPossible`, `cancel` |
| Same dependency: `NotificationChannelManager.java` | `createChannel`: notification audio attributes |
| Same dependency: `TimedNotificationPublisher.java` | `onReceive`: posts and deletes fired stored records |
| Same dependency: `LocalNotificationRestoreReceiver.java` | `onReceive`: overdue replay behavior |
| Same dependency: `NotificationStorage.java`, `LocalNotificationsPlugin.java` | Saved pending IDs; schedule/getPending/cancel |
| `src/hooks/useOtpReminderEscalation.ts` | Separate completion polling/cadence/logging |
| `src/lib/otpReminderVoice.ts` | Separate three-repeat TTS phrase/singleton |
| `android/app/src/main/java/app/didisnow/worker/CancellationVoicePlugin.java` | Shared native TTS/alarm volume/cancellation-audio fallback |

## Verification and limits

**TEST PASS:** `bun run test -- src/lib/__tests__/startOtpReminder.test.ts src/lib/__tests__/startOtp.test.ts src/lib/__tests__/startOtpCompat.test.ts` — 3 files, **34 tests passed**, including 12 reminder tests. They confirm nominal offsets, exclusions, future-only planning and stable IDs; they do not validate native alarms, lifecycle races, notifications or sound.

**Browser:** 393×805 current preview opens sign-in without page errors. Authenticated booking flow unavailable for external/unmanaged Supabase; no credentials requested or synthetic worker selected. **NOT VERIFIED:** installed APK/source parity, real phone foreground/background/locked/silent/DND/force-stop/offline/reboot playback, hosted sender parity, and true delivery/played receipts. No Android rebuild was needed for this read-only investigation.

## Simple answers

1. **First reminder:** scheduled 10 minutes after accepting the booking, or assignment time when acceptance is absent; only if Start OTP is required, not yet verified and the booking is still assigned/accepted/on the way. Hearing it exactly then is not guaranteed.
2. **Again:** scheduled every 5 minutes; a sleeping phone can deliver later.
3. **How many:** up to 23 nominal reminders through 2 hours; actual audible count is unknown, and reboot can replay missed stored alerts late.
4. **Words:** the Start clip says **“OTP, OTP, OTP.”** It never says the customer's digits. The longer “please enter OTP” speech belongs to the separate completion popup.
5. **Stop:** when the phone successfully learns the server recorded Start OTP, ended the booking or changed its worker, or logout cancellation completes. Offline phones can keep old reminders.
6. **Reliable?** The nominal schedule is tested, but loudness, exact timing, stale stops and reboot behavior have material gaps. Real-phone reliability is **NOT VERIFIED**.

No changes are proposed or implemented; awaiting approval for any future change.