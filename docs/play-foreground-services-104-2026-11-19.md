# Foreground service permission audit — Didi Now Partner 10.0.04 (104)

**Verdict: NOT READY FOR GOOGLE PLAY. No permissions removed, no AAB generated or verified, no publication/deployment/force update.**

## Decisions

- **Health — retained at the user's explicit instruction “Keep pending replacement.”** Contrary to the initial assumption that step counting was unused, current app code starts a five-minute movement check after a booking is assigned/accepted. Its native service uses actual step sensors and runs background heartbeats. Removing only the permission while keeping this service could produce Android foreground-service failures and affect reachability. Passive tracking is explicitly stopped in current App.tsx; it is not continuously started on login. Older movement notes saying it runs continuously are not evidence of current behavior.
- **Media Playback — retained because the existing continuous Start OTP voice implementation requires it.** Removing it while preserving that implementation would break foreground promotion on Android 14+. This is not a claim of Google Play policy eligibility or acceptance.
- **Removed permissions: none.** No misleading manifest removal marker or alternate service type was introduced. No health/fitness purpose is invented for a worker booking app. Health's replacement and media policy/user-initiation review remain release blockers.

## Exact origin and runtime consumers — SOURCE READ

| Permission | Declared origin | Service declaration | Runtime |
|---|---|---|---|
| `android.permission.FOREGROUND_SERVICE_HEALTH` | `android/app/src/main/AndroidManifest.xml`, line 15 at audit time | `.MovementTrackingService`, `foregroundServiceType="health"` | `MovementTrackingService.kt` registers TYPE_STEP_COUNTER/TYPE_STEP_DETECTOR; Android 14+ calls three-argument startForeground with FOREGROUND_SERVICE_TYPE_HEALTH. StepCounterPlugin.startMonitoring calls startBooking/startPassive; current App.tsx invokes only booking tracking and explicitly stops passive tracking. |
| `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Same app manifest, line 16 | `.StartOtpAlarmService`, `foregroundServiceType="mediaPlayback"` | Engine calls startForegroundService; service calls startForeground using manifest type, plays packaged R.raw.start_otp_voice via MediaPlayer with USAGE_ALARM/CONTENT_TYPE_SPEECH, partial wake lock, optional looping. |

MovementTrackingService owns a 60-second BackendSync heartbeat ticker while alive. Its booking session has a finite five-minute sensor window. Neither the current booking monitoring call nor its health foreground classification is merely an unused future declaration. Existing ACTIVITY_RECOGNITION permission/optional setup was left untouched as requested by the keep decision.

### All installed Capacitor plugins

Read installed Android manifests and Gradle dependency declarations for: **App, Device, Filesystem, Geolocation, Local Notifications, Preferences, Push Notifications, and community Text-to-Speech**, plus Capacitor Android core and generated Cordova manifest. Cross-checked generated capacitor.build.gradle and capacitor.plugins.json: these are the eight linked plugin projects.

**Neither disputed permission nor either foreground-service type is declared in these plugin source manifests.** Local Notifications contributes RECEIVE_BOOT_COMPLETED, WAKE_LOCK and POST_NOTIFICATIONS; Push Notifications contributes a Firebase messaging service; Text-to-Speech contributes a TTS_SERVICE package-visibility query. Others/core have empty source manifests for permissions. Geolocation being installed does not establish a location permission or runtime use.

Read app and plugin dependency declarations, including Firebase Messaging (app BoM 33.6.0 and plugin version resolution), AndroidX WorkManager 2.9.0, Ionic filesystem/location libraries, Play Services and TTS dependencies. **Resolved transitive Maven AAR manifests were not available for inspection.** Therefore no claim is made that third-party resolved manifests cannot contribute further declarations. Definitive provenance requires the release manifest-merger report below; app source alone already explains both warnings.

## Audio/alert path sweep — SOURCE READ, no runtime changes

- **StartOtpAlarmService / Engine / Receiver:** finite voice at 10 and 15 minutes; continuous loop from 20 minutes after server acceptance for flagged unstarted bookings. Server-start/terminal/reassignment/account cleanup stops; notification offers “Silence 5 minutes.” Service reconciles server state periodically and on connectivity; player releases on destruction. Boot receiver invalidates old time and posts fallback rather than launching media FGS from BOOT_COMPLETED. Android 15+ prohibits that boot launch. Background launch exceptions can still apply; timing/foreground delivery requires device tests.
- **BookingNotifications / Firebase notification path:** normal notification posting and channel sound; not a Media Playback foreground service.
- **BookingOverlayService:** plays siren through MediaPlayer while showing overlay; its method named startForegroundService is explicitly a no-op, with no startForeground promotion. Do not infer FGS from method name. Unchanged.
- **BookingCancellationActivity / CancellationVoicePlugin:** activity/plugin MediaPlayer and TTS, not foreground services. Unchanged.
- **Community Text-to-Speech plugin / availability spoken help:** speech engine integration, not an app-owned media foreground service. Unchanged.
- **StepCounterPlugin / MovementTrackingService / App booking lifecycle:** Health consumer, kept pending replacement; must not disguise it as mediaPlayback/dataSync/specialUse to suppress warnings.
- **Practice notification paths:** no additional disputed permission declarations found; disabled test paths do not justify these permissions. Manifest still references PracticeAlertService without a matching source class found in this inventory; record as a separate native verification finding, not proof that it runs. No unrelated changes.

## What to declare in Google Play Console

Official guidance: [Understanding foreground service and full-screen intent requirements](https://support.google.com/googleplay/android-developer/answer/13392821?hl=en), retrieved directly during this review, and [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types).

For Android 14+ targets, go to **Monitor and improve → App content → Foreground services** (Console labels may vary). For each retained type, provide functionality, impact of delay/interruption, actual triggering steps, chosen use case and a reviewer-accessible demonstration video.

### Media Playback factual description (draft, not submitted)

“Didi Now Partner plays an audible Start OTP reminder for a worker's accepted booking while the phone is backgrounded or locked. The existing reminder plays at 10 and 15 minutes and loops from 20 minutes while the server still reports Start OTP pending. An ongoing notification opens bookings and offers a five-minute silence action. Verified start, cancellation, reassignment or account cleanup stops the reminder. Deferring or interrupting playback can cause the worker to miss the pending-start reminder.”

**Important policy gap:** Google's mediaPlayback example requires user-initiated audio/video playback. Current audio starts automatically after booking acceptance/server reconciliation; there is no explicit “start audio playback” action. Accepting a booking is not automatically proof of compliant user-initiated playback. Do not submit a fictitious demonstration of a playback control or promise declaration alone will pass review. Capture the actual accept → deadline → foreground/background audible reminder → notification silence → server-confirmed stop flow, and resolve whether the use case qualifies before publishing. If not, a separately reviewed reminder redesign is required; no timing/behavior was changed here.

### Health

Official Play examples are fitness-category health data sync, step counters and exercise tracking. This Worker App's booking movement audit/background heartbeat is not demonstrated to qualify. The user explicitly kept it pending replacement, so the undeclared Health warning cannot honestly be called fixed. Do not label the app a fitness app solely to obtain permission approval. Review a separate design that removes step tracking and preserves background reachability without misclassifying the service; deploy nothing as part of this audit.

## Permissions retained in current app source

Disputed FGS: **FOREGROUND_SERVICE**, **FOREGROUND_SERVICE_HEALTH** (temporary keep decision), **FOREGROUND_SERVICE_MEDIA_PLAYBACK** (current alarm dependency).

Other existing declarations left unchanged: INTERNET, SYSTEM_ALERT_WINDOW, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, VIBRATE, ACTIVITY_RECOGNITION, WAKE_LOCK, ACCESS_NETWORK_STATE, SCHEDULE_EXACT_ALARM. These support existing network/optional overlay/notifications/boot/sensor/audio/alarm flows but this report is not a blanket Play-policy approval of them. USE_FULL_SCREEN_INTENT remains an explicit removal directive; app source requests no location permission. Final merged dependencies must confirm that too.

## Tests and actual release status

- **730 frontend tests passed, 66 files**, including Start OTP phase/stop/completion-yield contracts and packaging guards. No source tests can establish Android merged manifest contents or physical audio behavior.
- Native Robolectric/Gradle tests **NOT RUN**: Java/Javac/Android SDK unavailable. No fresh merged manifest/merger report or AAB exists here.
- Production `dist/index.html` **absent**. Manual project builds are prohibited in this workspace. `npm run build` **NOT RUN**, Capacitor sync **NOT RUN** (held until build succeeds). Prior packaging verifier detects stale Android files. No release assets refreshed.
- Source identity remains **10.0.04 (104)**, **app.didisnow.worker**. Signing identity/Firebase/backend unchanged, but signing certificate match is not verified without existing upload key/actual AAB.
- Device notification/TTS/continuous alarm/background restrictions and authenticated full booking flow **NOT VERIFIED**. No user credentials requested.
- Previously staged backend approval patch remains undeployed and separately gated. Its prior isolated tests do not prove hosted enforcement. All-track code uniqueness still required beyond user-reported production 102.

## Exact local Windows merged-manifest/AAB verification

1. Update local source from connected repository. Install Node LTS, Android Studio, JDK 21 and SDK 36; configure Gradle JDK 21 and original upload keystore. Preserve Firebase file/package/version.
2. From project root, run separately and stop at failures:

```powershell
npm ci
npm run build
Test-Path .\dist\index.html
npx cap sync android
npm run android:verify-permissions
npm test
```

Require True for dist and success for build/sync/parity verifier. Android Studio must have Node on its PATH for preBuild's verifier. Then in `android`:

```powershell
.\gradlew.bat :app:processReleaseMainManifest :app:processReleaseManifest :app:testDebugUnitTest
Get-ChildItem .\app\build\intermediates -Recurse -Filter AndroidManifest.xml |
  Where-Object { $_.FullName -match 'release' } | Select-Object FullName
Get-ChildItem .\app\build\outputs\logs -Filter '*manifest*'
```

Read the final release merged manifest and `manifest-merger-release-report.txt`; use Android Studio's **Merged Manifest** view with release variant to trace each permission's origin, including resolved AAR libraries. Do not treat an intermediate source XML as the final packaged AAB.

**Expected for unchanged source:** Health and Media Playback still present; mediaPlayback type belongs to StartOtpAlarmService and health to MovementTrackingService. No unnecessary-permissions-absent claim can be made until the approved replacement is implemented and merged output rechecked. Keep USE_FULL_SCREEN_INTENT/location absence checks too.

3. Android Studio **Build → Generate Signed Bundle / APK → Android App Bundle → app → existing upload key → release**. No replacement/debug key. See `docs/play-release-104-2026-11-19.md` for complete Windows signing steps. Record actual output location.
4. Verify generated artifact:

```powershell
jarsigner -verify -verbose -certs "C:\actual-output\app-release.aab"
keytool -printcert -jarfile "C:\actual-output\app-release.aab"
java -jar "C:\tools\bundletool-all.jar" validate --bundle="C:\actual-output\app-release.aab"
java -jar "C:\tools\bundletool-all.jar" dump manifest --bundle="C:\actual-output\app-release.aab" --module=base > release-aab-manifest.xml
Select-String -Path release-aab-manifest.xml -Pattern 'FOREGROUND_SERVICE|foregroundServiceType|versionCode|versionName|package='
```

Compare upload certificate SHA-256 with Play App integrity, require jar verification and bundletool validation, verify **104/10.0.04/app.didisnow.worker**, permission provenance and fresh base/assets/public. A signed/generated AAB still is not publish-ready until both FGS policy blockers, approval enforcement and device upgrade/audio checks pass.

Please read the [Capacitor build/sync workflow](https://capacitorjs.com/docs/basics/workflow) and [Lovable community discussion of Capacitor work](https://lovable.dev/blog/supercharge-lovable-chrome-extension). Nothing is uploaded or activated by this report.