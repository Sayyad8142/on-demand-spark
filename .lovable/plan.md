# Background Notification & FCM Recovery — Audit + Fix Plan

## A. Audit findings (current state)

What already works:
- `AndroidManifest` declares `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `POST_NOTIFICATIONS`.
- `BootReceiver` is registered for `BOOT_COMPLETED`, `QUICKBOOT_POWERON`, `MY_PACKAGE_REPLACED` and re-warms `MovementTrackingService` + `LocationTrackingService` if the worker was online.
- `MyFirebaseService` is registered as a `FirebaseMessagingService`, pre-creates notification channels in `onCreate`, persists token on `onNewToken` to `SharedPreferences("worker_prefs", "pending_fcm_token")`.
- JS `useFCMTokenSync` re-evaluates token freshness on mount, app resume, and every 3 min (force refresh if missing/invalid/null platform/>7d old).
- Backend tracks `workers.fcm_token`, `fcm_token_status`, `fcm_token_platform`, `fcm_token_updated_at`.
- `AuthDebug` screen already exists at `/auth-debug` (5-tap on version).

Gaps causing the user's scenario (phone reboot → no app open → bookings created):
1. After reboot, **no Android component pulls a fresh FCM token until the user opens the app**. `FirebaseMessaging.getInstance().getToken()` is only triggered from JS via `PushNotifications.register()`. `onNewToken` only fires if Firebase rotates the token — not on plain reboot. Existing token from before reboot is still valid → notifications **should** arrive, but if the token was stale/invalidated by Play Services (e.g. APK update, data clear, long offline) we never know until the worker opens the app.
2. `BootReceiver` does **not** schedule any token health-check or backend ping. We have no "alive after reboot" signal.
3. Backend has no concept of **notification health heartbeat** — `last_active_at` is only refreshed when the JS layer is running. After reboot, worker may stay marked online for hours while unreachable.
4. No **"silent FCM ping"** path. Dispatcher trusts `fcm_token_status='active'` even if the device hasn't been seen since last week.
5. `MyFirebaseService.onNewToken` writes to SharedPreferences but **does not POST the new token to Supabase directly**. If the app is never opened again, the rotated token is never synced. This is the single biggest reliability gap.
6. No tracking of `last_fcm_received_at` per worker → cannot detect "online but unreachable".
7. No diagnostic surface for: battery-optimization status, auto-start status, last FCM received, last token sync, boot count.
8. OEM auto-start (MIUI/Vivo/Oppo/Realme/OnePlus) is not surfaced to the worker as actionable guidance after first install. We have `BatteryOptimizationHelper` but no OEM-specific prompts.

## B. Real-world answers to user's questions

| Question | Today's reality |
|---|---|
| Notifications work after reboot without opening app? | Yes, **if** the existing FCM token is still valid. Android auto-starts `MyFirebaseService` on first FCM message — no manual open needed. |
| Token survives reboot? | Yes — Firebase persists it. Token only changes on app reinstall, data clear, Play Services reset, or 270-day inactivity. |
| App auto-starts? | No — only `MyFirebaseService` (on push) and `BootReceiver` (on boot) wake without user. Web layer / JS only runs after manual open. |
| Token refreshed after reboot? | **No** — only on next manual app open. |
| Worker shown online when unreachable? | **Yes — bug**. `last_active_at` decay isn't enforced; dispatcher will still target them. |
| BOOT_COMPLETED handled? | Partially — services restarted, but no token validation, no backend ping. |
| Battery opt / Doze impact? | High-priority `data` FCM bypasses Doze, but only if backend sends with `priority:'high'` — needs verify in `send-fcm`. |
| OEM kills? | We don't probe; users on Xiaomi/Oppo silently lose alerts. |
| Heartbeat reliable after reboot? | No — JS heartbeat doesn't run until app opens. |

## C. Proposed changes (this plan)

### 1. Boot-time silent token sync (Android)
- Extend `BootReceiver` to enqueue a one-shot `WorkManager` job (`FcmBootSyncWorker`) that:
  - Fetches a fresh token via `FirebaseMessaging.getInstance().getToken()`.
  - Reads stored `worker_prefs.user_id` (already saved at login).
  - POSTs to a new edge function `worker-boot-ping` with `{ user_id, fcm_token, event:'boot', android_version, oem }`.
  - Backed off + retried on network failure.
- Same worker scheduled on `MY_PACKAGE_REPLACED`.

### 2. Native token-rotation auto-sync
- In `MyFirebaseService.onNewToken`, in addition to SharedPreferences, fire-and-forget HTTP PATCH to Supabase REST (`/rest/v1/workers?user_id=eq.X`) using the saved access token. Falls back gracefully (still keeps SharedPreferences write so JS layer can re-sync on next open).
- New helper `BackendSync.kt` for both `BootReceiver` and `onNewToken`.

### 3. Edge function `worker-boot-ping`
- `verify_jwt = false` (called from native without bearer token possibly).
- Validates `user_id` belongs to a worker.
- Updates `workers.fcm_token`, `fcm_token_status='active'`, `fcm_token_updated_at=now()`, `fcm_token_platform='android'`, `last_boot_at=now()`.
- Returns 200.

### 4. Notification health heartbeat
- Add columns: `workers.last_fcm_received_at timestamptz`, `workers.last_boot_at timestamptz`, `workers.fcm_send_count int`, `workers.fcm_fail_count int` (some already exist per memory — verify and reuse).
- `MyFirebaseService.onMessageReceived` writes `last_fcm_received_at` via the same backend helper (or queues to SharedPreferences and lets next ping flush).
- `dispatch-pending-bookings` / `notify-next-tier`: if `last_active_at` older than 5 min AND `last_fcm_received_at` older than 30 min → mark `is_available=false` (auto-offline) before tier escalation.

### 5. Silent FCM keepalive
- Cron edge function `fcm-keepalive` (every 30 min) sends `data:{type:'PING'}` to each online worker. `MyFirebaseService` receives → updates `last_fcm_received_at` via backend helper → no UI shown. This is the single source of truth for "device reachable".

### 6. Battery / OEM diagnostics
- New Capacitor plugin method `BatteryOptimizationHelper.getDiagnostics()` returning `{ ignoringBatteryOptimizations, autoStartIntentAvailable, oemManufacturer, notificationsEnabled, fcmTokenPresent, lastBootAt }`.
- Surface in `AuthDebug` screen + add a banner on `Home` if any critical flag is red.

### 7. Diagnostic screen additions (`/auth-debug`)
- Current FCM token (truncated)
- `fcm_token_updated_at`, `last_fcm_received_at`, `last_boot_at`
- Notification permission status
- Battery optimization ignored?
- OEM (manufacturer) + auto-start hint link
- Last heartbeat time
- Worker availability + reason
- "Force token refresh" button + "Test FCM (silent ping)" button

### 8. Detailed logging
- Single `WorkerLog` Kotlin helper writing tagged lines (`[BOOT]`, `[FCM]`, `[TOKEN]`, `[BACKEND]`) to logcat; a ring buffer of last 200 lines persisted to SharedPreferences and exposed via Capacitor plugin so AuthDebug can show them.

## D. Out of scope for this iteration
- iOS (project is Android-only per memory).
- Replacing FCM with another channel.
- UI redesign of normal screens.

## E. Files to add / modify

```text
android/app/src/main/java/app/didisnow/worker/
  BootReceiver.kt                  (modify - schedule WorkManager job)
  FcmBootSyncWorker.kt             (new)
  BackendSync.kt                   (new - shared HTTP helper)
  MyFirebaseService.java           (modify - sync onNewToken + onMessageReceived heartbeat)
  BatteryOptimizationPlugin.kt     (modify - getDiagnostics method)
  WorkerLog.kt                     (new - ring buffer logger)
  WorkerLogPlugin.kt               (new - Capacitor bridge)

android/app/src/main/AndroidManifest.xml   (no new permissions needed; WorkManager auto-registers)

supabase/functions/
  worker-boot-ping/index.ts        (new)
  fcm-keepalive/index.ts           (new, scheduled)
  dispatch-pending-bookings/index.ts (modify - auto-offline guard)

migration:
  ALTER TABLE workers ADD COLUMN IF NOT EXISTS last_fcm_received_at timestamptz;
  ALTER TABLE workers ADD COLUMN IF NOT EXISTS last_boot_at timestamptz;
  (others already present per memory)

src/pages/AuthDebug.tsx            (modify - new diagnostics section)
src/components/Header.tsx or Home  (modify - unreachable banner)
```

## F. Rollout order
1. DB migration (new columns).
2. Edge function `worker-boot-ping` + `fcm-keepalive` cron.
3. Native: `BackendSync.kt`, `WorkerLog.kt`, `FcmBootSyncWorker.kt`, modify `BootReceiver` + `MyFirebaseService`.
4. Capacitor plugin extensions + AuthDebug UI.
5. Dispatcher auto-offline guard.
6. Manual test matrix: airplane-mode reboot, force-stop + reboot, app-update, data-clear, 24h offline.

Confirm and I'll implement in this order. The native + edge changes are the most invasive — happy to split into smaller PRs if you'd prefer to land step 1+2+3 first and validate before adding the keepalive cron.
