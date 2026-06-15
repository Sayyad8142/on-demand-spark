# Zero-Touch Worker Notification Redesign

Goal: workers never troubleshoot, never re-login, never get dropped from dispatch because of a device-health signal. The system self-heals silently in the background.

## 1. Decouple dispatch from heartbeat (highest impact)

Today `booking-notifications` / admin dashboards treat `last_heartbeat_at`, `stale_device`, `no_ack_count`, and `last_app_opened_at` as gating signals. We will make them **analytics-only**.

Changes:
- `booking-notifications/index.ts`: remove any filter or ranking penalty based on `stale_device`, `no_ack_count`, `last_heartbeat_at`, `last_app_opened_at`, `notification_health`. A worker is dispatch-eligible iff:
  1. `is_active = true`
  2. `is_available = true` (current availability window)
  3. `is_busy = false`
  4. service + community match
  5. `fcm_token IS NOT NULL` **OR** has a valid web-push subscription
- New nightly job `unstick-busy-workers`: reset `is_busy=false` when last accepted booking is terminal > 60 min.
- Admin UI: keep `stale_device` / `no_ack_count` columns but label them "Signal quality (analytics only)". Add a banner explaining they no longer affect dispatch.

## 2. Permanent worker sessions

- Capacitor Preferences already persists Firebase ID token. Add a silent refresh loop: on app start + every 50 min, call `firebase.auth().currentUser.getIdToken(true)` and update `supabase.auth` headers. Never sign the user out on token-refresh failure — retry with exponential backoff and surface a tiny "Reconnecting…" pill instead of bouncing to `/auth`.
- `AuthContext`: remove any `signOut()` calls triggered by notification/FCM errors. Only sign out on explicit user action or Firebase `auth/user-disabled` / `auth/user-not-found`.
- Add `onAuthStateChanged` watchdog that re-hydrates from Preferences if `currentUser` becomes null but a stored refresh token exists.

## 3. Self-healing FCM token pipeline

Single source of truth: `workers.fcm_token`. All refresh paths funnel through one function `syncFcmToken(reason)` that:
1. Calls `FirebaseMessaging.getToken({ vapidKey })` (web) / native `FirebaseMessaging.getToken()` (Android).
2. If token differs from cached, POSTs to `worker-heartbeat` with `{ worker_id, fcm_token, reason, app_state, app_version }`.
3. On `messaging/registration-token-not-registered` or any error → delete token, request a new one, retry up to 3× with backoff. Never surface to user.

Refresh triggers (all call `syncFcmToken`):
- App cold start (`main.tsx` bootstrap, after auth hydration).
- Capacitor `App.addListener('appStateChange', s => s.isActive && syncFcmToken('resume'))`.
- `FirebaseMessaging.addListener('tokenReceived', …)` (rotation).
- Android `BootReceiver` → `FcmBootSyncWorker` (already exists) → `worker-boot-ping` (already exists). Extend `FcmBootSyncWorker` to actually call `getToken()` first.
- `WorkManager` periodic job `FcmRefreshWorker` every 6 h, requires network, no battery constraint. Calls `BackendSync.sendHeartbeat(ctx, "periodic_refresh")` which now also force-refreshes the token.
- Server-side: when `send-fcm` gets `UNREGISTERED` / `INVALID_ARGUMENT`, mark `fcm_token_status='invalid'` and push a silent data message via web-push (if subscribed) telling the app to re-register. If no web-push fallback, simply wait for next periodic refresh.

## 4. Permissions: ask once, never nag

- `PermissionOnboarding.tsx`: shown once after first successful login. Stores `permissions_onboarded=true` in Preferences + `workers.permissions_onboarded_at` in DB.
- Remove repeating prompts from `Home.tsx` / `NotificationHealthWarning.tsx`. Replace with a passive "Notifications may be limited — tap to fix" chip in Profile only if `Notification.permission !== 'granted'` AND user taps the chip themselves.
- Battery optimization: detect via existing native bridge. If unrestricted = false, show the onboarding sheet **once** (flag `battery_hint_shown_at`). Never show again unless user opens Profile → Troubleshoot.
- Overlay permission: same one-time pattern. Overlay missing = booking still arrives via FCM notification (system tray). Never block dispatch.

## 5. Heartbeat → lightweight `last_seen` only

Keep the endpoint, shrink the payload, drop the cadence:
- Rename intent to "last_seen ping". Sent only on:
  - app cold start
  - `appStateChange` to active
  - successful FCM token sync
  - every 30 min while app is foreground (was 2 min)
- WorkManager periodic 6 h ping when app is backgrounded.
- `worker-heartbeat` writes only: `last_seen_at`, `last_app_opened_at`, `fcm_token` (if changed), `app_version`, `platform`. No more `stale_device`, `no_ack_count`, `notification_health` mutations from this path (those become derived/analytics fields updated by `send-fcm` outcomes).

### Risks of removing heartbeat entirely
- Lose ability to detect "phone offline for 3 days" before dispatch wastes a push → mitigated by trusting FCM's own delivery receipt (`send-fcm` already records `messaging.googleapis.com` response; mark token invalid on `UNREGISTERED`).
- Lose real-time "is the app open right now" for live tracking → keep the 30-min foreground ping; that's the minimum viable alternative.
- Admin analytics noisier → acceptable; dashboards switch to "last FCM success" as the primary signal.

## 6. Notification reliability maximization (no worker action required)

- Always send FCM **data-only** messages with `priority: high`, `content_available: true`, and a fallback `notification` block so the system tray fires even if the app process is dead.
- Add a **web-push fallback channel**: if the FCM call returns failure for an active worker, immediately try the stored `web_push_subscriptions` row for the same worker.
- Add a **SMS fallback** (Twilio/MSG91) for accepted-tier workers whose FCM has failed > 2 consecutive dispatches in the last 24 h. Silent for the worker; just a "New booking — open Didi Now Partner" text.
- Server-side token hygiene: nightly job purges tokens that have failed `UNREGISTERED` for 7 days and emits a one-time silent web-push to re-register.
- Keep `MovementTrackingService` foreground notification so Android doesn't kill the process while Online — this is the single most impactful reliability lever and requires no worker action.

## File / function changes (technical)

Frontend
- `src/lib/fcm.ts` — new `syncFcmToken(reason)` unified entry point with retry/backoff.
- `src/hooks/useFCMTokenSync.ts` — replace internals with `syncFcmToken`; hook into `appStateChange` + cold start.
- `src/hooks/useWorkerHeartbeat.ts` — cadence 30 min, payload trimmed.
- `src/contexts/AuthContext.tsx` — silent ID-token refresh loop, no auto sign-out on FCM/network errors.
- `src/components/NotificationHealthWarning.tsx` — convert to passive chip in Profile only.
- `src/components/PermissionOnboarding.tsx` — one-shot flag.
- `src/pages/Home.tsx` — remove repeating health warnings.

Android
- `BackendSync.kt` — `sendHeartbeat` drops `stale_device` writes; always carries fresh token.
- New `FcmRefreshWorker.kt` (WorkManager periodic 6 h, network-required).
- `FcmBootSyncWorker.kt` — call `FirebaseMessaging.getInstance().token` before pinging backend.
- `MyFirebaseService.java` — `onNewToken` already wired; ensure it also clears any cached "invalid" flag locally.

Edge functions
- `worker-heartbeat/index.ts` — slim writes to `last_seen_at`, `last_app_opened_at`, `fcm_token`, `app_version`, `platform`. Stop touching `stale_device` / `no_ack_count` / `notification_health`.
- `booking-notifications/index.ts` — remove heartbeat-based filters; rely on `fcm_token IS NOT NULL` + availability + busy.
- `send-fcm/index.ts` — on `UNREGISTERED` mark token invalid + trigger web-push fallback; on success bump `last_fcm_success_at`.
- New `send-worker-sms-fallback/index.ts` (only if SMS provider secret is configured).
- New cron `unstick-busy-workers` (hourly).

Database (single migration)
- `workers`: add `last_fcm_success_at timestamptz`, `permissions_onboarded_at timestamptz`, `battery_hint_shown_at timestamptz`. (Keep existing analytics columns; just stop using them for dispatch.)
- Comment on `stale_device` / `no_ack_count` / `notification_health` clarifying "analytics only — do not gate dispatch".

## Out of scope (ask before doing)
- Actual SMS provider wiring (needs secret + cost approval).
- Removing existing analytics columns (kept for back-compat with admin app).
- Changes to admin dashboard wording (separate repo).

## Confirm before I build
1. OK to fully remove heartbeat/staleness from dispatch eligibility?
2. OK to drop foreground heartbeat cadence from 2 min → 30 min?
3. Want me to scaffold the SMS fallback now (disabled until secret added) or skip entirely?
