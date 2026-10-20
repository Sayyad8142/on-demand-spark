# Phase 1 ACK compatibility — Worker App (consolidated, scope frozen)

Status: source complete, offline-tested. **Android compilation: PENDING. Real-device testing: PENDING.**
Nothing built, published or deployed. No further feature changes in Phase 1.

## 1. What the app does
- Native FCM receiver reads `ack_token` and sends `push_received` only on real push arrival; payload keys logged, never values.
- `ack_token`, `booking_request_id`, `booking_id` travel together through overlay, full-screen activity, `OfferQueue` (process restart) and `AckQueue` (retry). Stored only in app-private SharedPreferences.
- `popup_shown` when displayed, `worker_seen` when viewed; polling/realtime never send `push_received`.
- Accept/Reject never wait on or depend on ACK success.
- JS registry: exact `booking_request_id` first; booking-ID alias points only to the newest offer; unknown/other-booking request IDs never resolve; reassignment removes token + alias.
- Logout/account switch: clears `AckQueue`, `OfferQueue`, cancels scheduled `AckRetryWorker`, bumps queue generation (stale in-flight callbacks cannot re-enqueue); JS clears tokens, aliases, ack set, cached worker ID.

## 2. Response handling and retry limits
| Response | Behaviour |
|---|---|
| 2xx | Done. `skipped` / `request_not_found` = terminal, logged as "not recorded" |
| 400 | Terminal contract failure, no retry |
| 401 / 403 | Terminal, no retry loop (with or without token) |
| 408 / 429 / 5xx / network | Retry within limits below |

Limits (retry-worker attempts; the **initial request is not counted**):
- **Token ACK:** 1 initial request + up to 3 retries = max 4 sends, and stops earlier at token `exp`.
- **Session-only ACK:** 1 initial request + up to 5 retries = max 6 sends, within 24h queue age.
- Token `exp` is read client-side only to stop retries; server verification is authoritative; it is never used as the offer's accept deadline.

**Contract match: NOT VERIFIED.** The Admin Panel Phase 1B draft (seen earlier) defines token expiry = offer TTL + 15-min grace and idempotent events, but no client retry count was recorded from it. The Admin Panel project is not accessible from this workspace now, so the owner must confirm these limits with the backend.

## 3. Checks actually run
- `bunx vitest run`: **6 files, 85/85 passed** (mocked transport): includes classification, alias/successive offers, delayed old-offer events, reassignment, expiry, account switch.
- TypeScript check: no errors.
- Android Java/Kotlin compile: **PENDING** (sandbox has no JDK/SDK/Gradle).

## 4. Source commit
Phase 1 fixes are contained in commit `6843bae6be9971bea416026d3d82bed937e241f7` and any later commit (this report update lands in a later commit). On your Mac: `git log --oneline | grep 6843bae6` must print a line.

## 5. Required toolchain (from repo config)
- Gradle wrapper **8.11.1** (`gradle-wrapper.properties`) — use `./gradlew`, no separate install.
- Android Gradle Plugin **8.9.2**, Kotlin plugin **1.9.24**, google-services 4.4.2.
- **JDK 21** (`sourceCompatibility`/`jvmTarget` 21).
- Android SDK **compileSdk 36 / targetSdk 36**, minSdk 22 (install Platform 36 + Build-Tools 36 via Android Studio SDK Manager).
- Node + npm for the web bundle.

## 6. Mac build commands (from the Worker App repo folder)
```bash
git pull
git log --oneline | grep 6843bae6          # must print the commit
java -version                              # must show 21
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm install
npx vitest run                             # expect 85 passed
npm run build
npx cap sync android
cd android
./gradlew --version                        # Gradle 8.11.1
./gradlew :app:compileDebugKotlin :app:compileDebugJavaWithJavac
./gradlew :app:assembleDebug
ls app/build/outputs/apk/debug/            # app-debug.apk
```
If Java is not 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`.
Release versionCode: **PENDING** until the owner provides the highest uploaded Play value.

## 7. Test backend — BLOCKER for device tests
The current source points **only at production** (`paywwbuqycovjopryele`):
- JS: `.env` `VITE_SUPABASE_URL`, fallback in `src/config/env.ts`.
- Native hardcoded URLs: `BackendSync.kt`, `BookingAlertActivity.kt`, `BookingOverlayService.kt`, `KeepaliveAckWorker.kt`, `LocationUpdateWorker.kt`, `LocationTrackingService.kt`.
- `android/app/google-services.json` (production Firebase project).

A debug APK built as-is would talk to production, and the new ACK handler is not deployed anywhere. Before device tests, decide one:
- (a) a staging backend: staging Supabase URL/anon key for JS and all six native files, plus the staged ACK handler and send-FCM token patch deployed there, and a staging Firebase project; or
- (b) explicit owner approval to test against production with a test worker account (old handler still live, so new-contract checks will not pass).
Switching URLs is a code change and is not made in this phase.

## 8. Debug signing / install conflict
Debug APK uses the same `applicationId` `app.didisnow.worker` as the Play app but is signed with the local debug key. Android will refuse to install it over the Play version ("App not installed" / `INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Do **not** uninstall the production app on a working phone. Use a spare phone or an Android Studio emulator (with Google Play services for FCM). A side-by-side install would need a separate package name plus a matching Firebase app entry, which is a later, separately approved change.

## 9. Device test steps (PENDING)
Confirm `booking_offer_events` rows on the test backend; no token in logcat/WorkerLog.
1. Foreground: offer → `push_received`, `popup_shown`; Accept works.
2. Background (Home pressed): overlay → same events; Reject works.
3. Swiped away from recents: FCM still delivered → same events.
4. Android force-stop (Settings → Force stop): no FCM until opened — expected, no `push_received`.
5. Process restart with queued offer: kill during first offer, reopen → second offer ACKs carry token.
6. Offline → reconnect: queued ACKs flush within limits in §2.
7. Logout → login as another worker: no old ACKs sent.
8. Expired session + background offer: token ACK succeeds (needs new handler).

## 10. Remaining blockers
1. Android compile + APK (owner's Mac).
2. Test backend decision (§7).
3. Confirmation of retry limits against backend contract.
4. Highest Play versionCode for release.
5. Backend deploys (secret, send-FCM token, ACK handler) — separately approved.
