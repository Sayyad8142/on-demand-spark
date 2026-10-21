# Android Test Build Handoff — Optional-Popup Setup (2026-10-22)

Scope frozen. No features added, no dispatch change, nothing published or deployed, no test notifications sent.

| Item | Status |
|---|---|
| Source commit | `f329be7007700ae8ed4f7482c22ae10644a8667f` ("Added booking alert checks", 2026-10-21 18:55 UTC); working tree clean |
| In connected GitHub repo | NOT VERIFIED from here (connection not visible to the agent). Check on GitHub that this commit is on the synced branch. |
| Offline tests | 102/102 pass (`bunx vitest run`); TypeScript check clean |
| Android compile | **PENDING** — no JDK/Android SDK/Gradle in this sandbox |
| Phone testing | **PENDING** |

## 1. Build on a Mac
Required: JDK 21 (Temurin), Android SDK Platform 36 + Build-Tools 36, Node 20+. Gradle 8.11.1 (wrapper), AGP 8.9.2, Capacitor 7. App: `app.didisnow.worker`, versionName 10.0.02, versionCode 102.

```bash
brew install --cask temurin@21 android-studio
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=$HOME/Library/Android/sdk
git clone <your-repo-url> didi-worker && cd didi-worker
git checkout f329be7007700ae8ed4f7482c22ae10644a8667f
npm ci
npm run build
npx cap sync android
cd android && ./gradlew clean assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## 2. Install without touching the Play Store app
The debug APK uses the **same app id** as the Play app but a different signing key, so `adb install` fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. **Do not uninstall the Play app to get past that.**
Safe options:
- **Use a second phone** (or an emulator) that doesn't have the Play app. Simplest, no code change.
- Or (needs your approval, it's a build-only change): add `applicationIdSuffix ".test"` to the debug build. Firebase would then also need a `app.didisnow.worker.test` app registered in `google-services.json`, or push alerts won't arrive.

**Backend:** the test build talks to the **production** backend (`paywwbuqycovjopryele`). Use the demo/test worker account only, with a test community. Every action is real.

## 3. Phone checklist (all PENDING)
1. Notifications denied → setup stays; "Open Settings" opens settings; enable → return → setup moves on.
2. Popups off → "Continue with notifications" → Home opens; health card says popups off, notifications only.
3. Tap a booking notification → the same offer opens; an expired offer cannot be accepted.
4. Alerts with app open, in background, phone locked (locked: expect a notification only, no popup promised).
5. Booking alert channel off → setup/Home says blocked; sound off → says silent; fix in Settings → re-check on return.
6. Accept and Reject work once each (no duplicates); logout clears; switching account shows no old offers.

## 4. Google Play guidance for declared permissions
| Permission | Requirement (official) |
|---|---|
| `SYSTEM_ALERT_WINDOW` | No Play Console declaration form found. Play's [Permissions policy](https://support.google.com/googleplay/android-developer/answer/9888170) says special permissions are granted through system settings, and the app must stay usable if one is refused. Option 2 does this. |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_HEALTH` (`MovementTrackingService`, type `health`) | **Play Console declaration required** (App content → foreground services), with a description and video ([Play FGS requirements](https://support.google.com/googleplay/android-developer/answer/13392821)). Android requires a runtime prerequisite such as `ACTIVITY_RECOGNITION` ([FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types#health)). Play describes `health` for fitness apps: whether a worker movement check qualifies is a **review risk — owner decision**. |
| `USE_FULL_SCREEN_INTENT` | Removed from the manifest, so no declaration needed ([same FGS page](https://support.google.com/googleplay/android-developer/answer/13392821)). |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Covered by Play's Device and Network Abuse policy. **NOT VERIFIED** in this pass. |
| `POST_NOTIFICATIONS`, `ACTIVITY_RECOGNITION` | Runtime prompts with an explanation. No Play form found. |
| `INTERNET`, `VIBRATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` | Normal permissions. No declaration found. |
