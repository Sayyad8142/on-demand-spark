# Android notification repair — 17 November 2026

## Result
Implemented client/native source corrections; **installed APK delivery is NOT VERIFIED**. Nothing deployed, published, sent or changed in dispatch, priority, assignment, offer timing, OTP or payments.

### SOURCE — issues corrected
- Home's “Notifications are turned off” card was driven by historical `notification_repair_failures >= 3`, even when the current permission was granted. It now requires a current unsuccessful repair and unhealthy state. Granted permission shows a separate connection message, not permission denial; healthy state removes the card.
- Native permission is checked with Capacitor PushNotifications, published into Home before the slower Firebase/server checks, and refreshed immediately on open, native resume (including Settings return), visibility and network reconnect. Pending checks do not claim denied permission.
- Retry always reads health back, including after registration failure. Repair re-registers Firebase, uses the shared token writer and verifies the resulting phone/server token match. A server token alone no longer proves Android readiness.
- Registration listeners precede register(); old pending tokens no longer bypass requested registration. NativePushService uses the same registration/writer path and removes only its own listener.
- Token writes verify the logged-in Supabase user matches the account being updated, and use `workers.user_id`; no phone-based relinking. No fake availability, health or delivery acknowledgment writes were added.
- Custom MyFirebaseService now forwards token rotation to Capacitor's registration callback while preserving native background persistence and synchronization.
- Open Settings now uses a real Android app-notification Settings intent through AuthBridge, rather than an unavailable AppLauncher / browser URL.
- Home's browser Notification check does not run in the Android APK.
- APK permission verification referenced two logging markers removed from current onboarding. It now checks current native resume, Retry readback and connection-message markers. This does not itself regenerate packaged assets.

### SOURCE — Android configuration and booking flow
- `app.didisnow.worker` matches Firebase's configured Android client; Firebase Messaging, Google Services plugin, Capacitor push dependency, POST_NOTIFICATIONS and custom Firebase service declaration exist. AuthBridge is registered before bridge startup.
- Data-only BOOKING_ALERT routes through MyFirebaseService → OfferQueue → BookingNotifications / native alert Activity or optional overlay. Existing deadlines, busy checks, duplicates, tray taps, Accept/Reject and ACK behavior were left unchanged.
- Token rotation continues native pending-token storage, background boot sync and heartbeat. Existing backend implementations and Admin dispatch were not deployed or runtime-tested.
- Firebase initialization in the **installed** APK and its current token mapping remain NOT VERIFIED; matching source configuration does not prove installed configuration.

## TEST — fresh results
- **689 tests passed in 63 files**, including new native permission/resume/slow-check/Retry/account-isolation, immediate registration, rotation, session-bound write tests and existing offer/OTP regressions.
- Preview build OK; reported `use-mobile.tsx` UMD error NOT REPRODUCED. The hook already imports React hooks; quoted instruction text is not source code.
- Mobile 393×805 `/home` redirects to `/auth`, no page errors or Vite error overlay. Authenticated Home/delivery flow NOT VERIFIED: external unmanaged Supabase session unavailable.
- Android compilation/unit-test attempt blocked: JAVA_HOME unset and no Java executable. No APK was built or installed here.
- Preexisting packaged Android asset check failed. The old check required removed markers; current assets must be rebuilt and synchronized below. Fresh APK assets NOT VERIFIED in this environment.

## Exact local rebuild steps
Use the latest code from the connected repository. Requires Android Studio/Android SDK (platform 36), Java **21**, and the existing correct Firebase configuration. Do not replace Firebase credentials or enable a preview server URL.

```bash
npm install
npm run build
npx cap sync android
npm run android:verify-permissions
```

Then, from the `android` folder:

```bash
./gradlew clean :app:compileDebugJavaWithJavac :app:compileDebugKotlin :app:testDebugUnitTest :app:assembleDebug
```

Windows: use `gradlew.bat` instead of `./gradlew`. Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Install on an isolated test phone:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

A debug APK cannot replace a production APK signed with a different key. Prefer a separate test phone; do not uninstall a worker's live app to work around signing. For an approved production-signed local test, use existing release signing stored outside the repository and `./gradlew clean :app:assembleRelease`; inspect `android/app/build/outputs/apk/release/`. Unsigned release output is not installable until signed. No release/publication is approved by this report. Version remains 10.0.03 / 103; any future store release needs a separately approved higher build number.

After pulling future native changes, rerun `npm run build` and **`npx cap sync android`** before rebuilding. See [Lovable mobile development guide](https://lovable.dev/blog/mobile-app-development).

## Physical-phone release gates — NOT VERIFIED
1. Install updated APK; log in as the approved test worker. With permission already granted, confirm permission enabled immediately and no false disabled card; verify token/server match using safe diagnostics (never share tokens).
2. Deny notification permission, open Settings from the app, allow it and return. Confirm native resume refresh without restart; repeat app restart and background/foreground.
3. Temporarily remove connectivity: permission must stay allowed, readiness must not be faked, Retry must report connection/registration failure. Restore connectivity and verify Retry succeeds with server readback.
4. Verify Firebase token creation and token rotation synchronize only the logged-in worker; test logout/account switch without old-account state leakage.
5. With Admin approval, send one real test offer to an eligible isolated worker in each state: foreground, background and locked screen. Verify tray/optional popup, correct card, original expiry, single presentation, Accept/Reject and server-confirmed assignment readback.
6. Verify expired and duplicate offers never remain actionable and active booking suppresses new offers. Do not alter timing to make tests pass.
7. Confirm installed version/assets/signing and Android channel sound/app notification toggles. Locked-screen heads-up visibility depends on phone settings; no full-screen-intent bypass was added.

**Publication/delivery verification gate remains closed** until these phone tests pass. Backend issues, if observed, require separate approval and an authoritative hosted-source review.
