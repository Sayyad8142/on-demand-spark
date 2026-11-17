# Notification flow sweep — 17 November 2026

## Rule
An Android worker whose notifications are allowed must never see them labelled turned off because token registration, server synchronization or a permission check failed. Booking-alert readiness requires a verified current phone/server token match; granting permission alone is not proof of delivery. Retry must actually register/synchronize and read back the result.

## Places read and outcomes (SOURCE, not physical-phone verification)
| Place | Source outcome |
|---|---|
| Home, NotificationsOffDialog, WorkerHealthBadge, useWorkerHealth, usePushHealthGuard | Corrected previously: historical repair failures cannot show a permission-denied card. Native resume refreshes permission before token checks. Follow-up: unknown permission is not displayed as denied. |
| Availability ON / onPushUnhealthy in Home | Uses shared health/repair. Existing gating unchanged; failure directs worker to remaining setup rather than declaring successful delivery. |
| PermissionOnboarding and permissions helpers | Reads native permission and channel independently, refreshes on native Settings return; permission-only request success is not token registration. Existing optional popup/activity choices unchanged. |
| DeviceReadiness / useDeviceReadiness | Was declaring an old server token ready. Fixed: use current phone/server health; added genuine repair action and native Settings-return refresh. Permission and connection failures remain separate. |
| Settings / usePushRegister | Was displaying Registered for any stored token, including invalid/mismatched tokens; status callback also changed each render. Fixed: native verified snapshot, stale registration state cleared, stable callback, resume refresh, register success requires readback. Token prefixes removed from registration logging. |
| BookingDiagnostics | Native permission check follows rule; separately labels historical server push health. No permission denial inferred from token errors. Server token presence/status remains historical information, not confirmed delivery. |
| Troubleshoot | Previously offered browser push inside the APK. Fixed: browser-only controls hidden in native app; Verify Push link goes to native Device Readiness. JWT/battery/autostart diagnostics unchanged. |
| VerifyPush | Browser-specific permission/subscription path. Fixed native direct navigation: redirects to Device Readiness and does not execute browser subscription checks. |
| WebPushService, push/webPush, services/push selection | Browser-only path selected separately. Native registration uses NativePushService. Existing browser settings/subscriptions unchanged. |
| NativePushService | Previously corrected: listeners before registration, same verified token writer, own listener cleanup. |
| App native initialization, native/push, lib/fcm | Registration callback precedes register; lib/fcm routes foreground/taps through existing absolute-deadline parser/coordinator. No new offer timing/assignment logic. |
| useFCMTokenSync | Found same-token shortcut could skip repair of an invalid/stale server row. Removed that shortcut when freshness evaluation requires a write; token-prefix logging removed. Existing interval unchanged. |
| useAutoPushRepair, useStartupHealthAudit | Use shared snapshot/repair, no browser permission. No fabricated delivery claim added. |
| usePermissionRegressionWatch | Unknown permission-read errors previously counted as revoked permission. Corrected: only denied/prompt constitutes regression. Other permission choices unchanged. |
| usePostBootVerification | Previously removed push_unhealthy from remaining failures even if repair failed. Corrected: independently reread push health after repair. |
| useWorkerHeartbeat, lib/workerHeartbeat | Native permission uses Capacitor, browser permission only on web; sends device info, not an authoritative successful delivery claim. Existing timing/identity compatibility preserved. |
| AuthBridge, MainActivity | Current Firebase token access, actual notification Settings intent; bridge registration before startup. Source checked in initial fix; native compile remains unavailable. |
| MyFirebaseService | Rotation forwards to Capacitor plus existing background persistence. Existing booking-offer routing, expiry, busy/duplicate suppression unchanged. |
| BookingNotifications | Reads Android NotificationManager, respects existing channel settings and expires tray notification using original offer timer; no forced settings changes. |
| BootReceiver, FcmBootSyncWorker, HeartbeatWorker, BackendSync | Boot fetches current Firebase token; native heartbeat reads NotificationManager state. Source has legacy anonymous/id-based background compatibility: security/hosted parity needs separate backend review, not silently replaced in this task. |
| worker-heartbeat (repository source) | Reads notification_permission_granted independently of FCM. Calls repair_worker_push_health on supplied token: that RPC definition/current hosted behavior is NOT VERIFIED. Existing watch-only identity audit is not authorization enforcement. No deployment. |
| worker-boot-ping (repository source) | Does not infer permission from token; legacy source trusts supplied user_id to update token. Security finding requires separately approved hosted-source/identity hardening; no deployment. |
| send-fcm (repository source) | Distinguishes invalid tokens from permission and records send results, not confirmed display. Legacy fallback promotes tokens; current hosted parity NOT VERIFIED. No send/deploy. |
| booking-notifications (repository source) | Explicit notification and overlay flags affect eligibility. Overlay gating differs from optional-popup app policy; left unchanged because dispatch/assignment changes explicitly prohibited. Needs Admin/backend approval and authoritative hosted review. |
| fcm-keepalive (repository source) | Silent PING candidates use token status, not UI permission labels. Server send does not prove phone display. No send/deploy. |
| Database migrations: notification/overlay metadata; upsert_worker_diagnostic_status | Metadata stores reported permission, diagnostic upsert preserves newer timestamps and is service-only. No data/policy changes. repair_worker_push_health, compute_worker_reachability and recompute_worker_notification_health definitions absent from searched local migrations: NOT VERIFIED, cannot infer deployed behavior. |

## Fresh verification
- **694 tests pass in 64 files**. Added slow/failed permission checks, native Settings return, genuine Device Readiness repair, current-token mismatch and existing registration/rotation/account tests; existing booking/OTP tests pass.
- Latest preview build OK. Reported mobile-hook UMD instruction-string error remains NOT REPRODUCED; source already imports React hooks.
- Initial mobile browser check: `/home` → `/auth`, 393×805, no page errors or error overlay. This is public-route verification only, not signed-in Home or installed Android behavior.
- No production backend deployment, real push send, publication, settled record edit, dispatch/priority/assignment/OTP/timing change, permission-setting change or example-data change.

## Still NOT VERIFIED / blocked
- Authenticated worker end-to-end: external unmanaged Supabase session unavailable.
- Android compilation and APK build: no Java/Android toolchain. Initial Gradle attempt failed because JAVA_HOME/java missing.
- APK asset freshness: local build + Capacitor sync required; no fresh APK packaged here.
- Physical phone permission grant, Settings return, Firebase initialization/token rotation, real approved offer delivery/acceptance while foreground/background/locked, sound, duplicates and expiry.
- Hosted function/RPC parity and legacy identity/overlay-gating findings above need separate approval and authenticated/source access. No backend correction/deployment was made.

## Exact rebuild steps (unchanged)
Update local code from the connected repository. With Java 21, Android SDK 36 and the existing Firebase config:

```bash
npm install
npm run build
npx cap sync android
npm run android:verify-permissions
```

From `android/`:

```bash
./gradlew clean :app:compileDebugJavaWithJavac :app:compileDebugKotlin :app:testDebugUnitTest :app:assembleDebug
```

Windows: `gradlew.bat`. Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Install on an isolated test phone using `adb install -r` with that path. Different signing keys cannot replace a production install; do not uninstall a live worker app to bypass this. Production-signed build requires existing signing outside the repository and separate release approval; version remains 10.0.03 / 103.

For later native updates, update local code then rerun **npx cap sync android** after building. Read the [Lovable mobile development guide](https://lovable.dev/blog/mobile-app-development).
