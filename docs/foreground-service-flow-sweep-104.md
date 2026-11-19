# Foreground service cross-app sweep — 10.0.04 (104)

## Rule in worker terms

The app should request only permissions it actually needs, and removing one must not stop booking alerts, spoken help or Start OTP alarms. Health and step tracking must remain unchanged pending the replacement the user selected. Permissions must be accurately declared in Play Console, not renamed to evade review.

## Source read during this sweep

| Worker-visible flow / background path | Code read | Rule outcome |
|---|---|---|
| Start Booking / pending Start OTP across navigation, resume and acceptance | StartOtpReminderManager.tsx; native/startOtpAlarm.ts; startOtpAlarm.ts; startOtpReminder.ts; StartOtpAlarmPlugin.kt; StartOtpAlarmService.kt; StartOtpAlarmRules.java | Media Playback is a real dependency of current foreground audio. Manager routes lifecycle/realtime wakeups, cancels ended/started bookings and cleans up on account transitions. Not an unnecessary declaration. Automatic playback's Play user-initiation suitability remains unresolved; no timing or playback redesign authorised. |
| Start OTP boot / upgrade restoration | StartOtpAlarmReceiver.kt; BootReceiver.kt | Boot handler does not launch Media Playback or movement FGS; alarm boot invalidates time rather than blindly replaying. Source follows no-boot-media-promotion rule. Physical restart behavior not tested. |
| End OTP reminder / popup voice | useOtpReminderEscalation.ts; otpReminderVoice.ts; App.tsx reminder listeners | Existing TTS/web speech, not an additional FGS. Completion reminder yields while flagged Start OTP remains pending. log_otp_reminder_event is telemetry, not permission authority. No extra Media Playback permission consumer introduced. |
| Cancelled booking voice / red activity | cancellationVoice.ts; CancellationVoicePlugin.java; BookingCancellationActivity.java; App.tsx cancellation handlers | TTS/MediaPlayer through plugin/activity; no foreground promotion. Native app skips duplicate web cancellation popup. Neither disputed permission needed solely for this flow. |
| Flat/address speaker | flatVoice.ts and its native CancellationVoice path | Tap-based TTS/web speech; no FGS promotion. No extra Health/Media Playback declaration. |
| Availability spoken help | Availability.tsx; useAvailabilityGuide.ts; availabilityVoice.ts | Tap-only speech with stop on hide/unmount, native TTS/browser fallback. A speech option named category playback is not Android foregroundServiceType mediaPlayback. Neither disputed FGS permission needed solely here. |
| Home/Bookings active-job movement lifecycle | App.tsx booking tracking effect; activityRecognition.ts; MovementStatusCard.tsx; StepCounterPlugin.kt and MovementTrackingService.kt from same request audit | Current five-minute booking sensor check is active; passive start is disabled/stopped. Service owns Health promotion and heartbeat ticker. KEEP under explicit user decision, not a fixed policy warning. Optional activity permission flow left unchanged. |
| Booking tray/head-up notifications / optional overlay | BookingNotifications.kt; BookingOverlayService.kt and OverlayPlugin.java promotion locations | Normal notifications and overlay audio. Method named startForegroundService in overlay is a no-op, not an FGS promotion. No extra service type added. |
| Heartbeats, FCM boot repair, ACK retries | Entire HeartbeatWorker.kt, FcmBootSyncWorker.kt, AckRetryWorker.kt read | None calls startForeground or WorkManager setForeground. They do not independently need either disputed type. Background execution/delivery not tested. |
| Practice notification / push | Entire PracticeNotificationsPlugin.kt and PracticePushReceiver.kt read | No foreground promotion. Does not justify a new Health/Media Playback permission. Real practice delivery not exercised. |
| All installed Capacitor plugin manifests | Parsed App, Device, Filesystem, Geolocation, Local Notifications, Preferences, Push Notifications, community TTS, core and generated Cordova manifest | Neither disputed permission/type appears. Both originate in app manifest: Health line 15 and Media Playback line 16, linked to MovementTrackingService and StartOtpAlarmService respectively. No third-party source duplicate found. |
| Final Android release packaging | Existing app manifest/config and prior-request CI/Gradle/package guards | Source remains 104; production dist absent and native artifact unavailable. Source XML is not a verified final manifest. |
| Database/edge call boundaries | Reminder RPC invocation, movement client calls and BackendSync heartbeat invocations identified | Database functions cannot declare Android manifest permissions. Hosted function bodies/security and runtime sender behavior were NOT checked in this sweep. No backend edits or settled-record changes. |

The source sweep found **no new unnecessary duplicate FGS declarations** to remove under the current keep decision. Health replacement and any media reminder redesign would change existing behavior; they remain separately scoped rather than being silently implemented. Neither Play warning is claimed resolved.

## Carried-forward checks and blockers

- Same-request full frontend suite: **730 tests / 66 files passed**; not rerun for this documentation-only sweep. Preview build checked separately. No Android runtime claims from those tests.
- All plugin source manifests were reparsed this sweep. Resolved third-party Maven AAR manifests, final release manifest merger report, physical phone playback/TTS/alerts and signed-in end-to-end remain **NOT VERIFIED**.
- Manual production build is prohibited here; `dist/index.html` absent; web build and Capacitor sync have **not succeeded**. Native Java/SDK/signing absent; no merged release manifest or AAB generated/verified.
- Health retained by user decision; Media Playback retained for continuous Start OTP. Official Play user-initiated-media eligibility and Health category suitability remain blockers, as detailed in the primary audit.
- Prior staged approval enforcement deployment, full sender/concurrency verification, all-track 104 uniqueness, upload certificate match and device upgrade checks remain outstanding. No force updates, publication or backend deployment.

Follow the exact Windows build → successful dist → cap sync → verifier → merged-manifest → signed AAB validation sequence in `docs/play-foreground-services-104-2026-11-19.md`; do not bypass asset guards. Before local native commands, update the checkout from the connected repository. Please read the [Lovable Capacitor discussion](https://lovable.dev/blog/supercharge-lovable-chrome-extension) alongside that handoff.