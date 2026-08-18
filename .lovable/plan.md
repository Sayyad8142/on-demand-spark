# Dispatch and Booking Delivery Audit & Reliability Fixes

Audited the complete booking lifecycle from dispatch to execution. The architecture is robust but contains a few critical gaps in background recovery and cross-layer synchronization.

## Findings

1.  **Worker ID Mismatch**: Some workers are registered with Firebase UIDs as their primary `id`, while newer workers use a secondary `user_id` column. Several ACK and heartbeat functions were missing the dual-resolution logic, causing silent failures for older workers.
2.  **Foreground FCM Gap**: `initFCM()` was missing from the app's entry point, meaning foreground FCM pushes were received by the OS but never routed to the app's UI or acknowledged via the `push_received` ACK.
3.  **Active Job Tracking Race**: Movement tracking was sometimes started multiple times or torn down during navigation because it wasn't strictly owned by the global `useActiveJob` state.
4.  **Polling Fallback Latency**: The app resumed polling correctly, but the heartbeat-based recovery was limited to a 45s interval, which is too slow for 60s dispatch windows.

## Proposed Changes

### Native Reliability (Android)
-   **Verification**: Ensure `MyFirebaseService.java` correctly handles `BOOKING_ALERT` data payloads and triggers the `push_received` ACK before launching the overlay.
-   **Durability**: Confirm `AckQueue.kt` correctly persists failed ACKs and `AckRetryWorker.kt` flushes them on network reconnect.

### Frontend Synchronization
-   **Centralized ID Resolution**: Update all hooks (`useActiveJob`, `useWorkerProfile`, `useWorkerHeartbeat`) to use a shared `getWorkerId` utility that handles the `user_id OR id` pattern.
-   **Global Movement Lifecycle**: Pin movement tracking strictly to the `useActiveJob` status in `App.tsx` to ensure it survives navigation.
-   **Unified Alert Hoisting**: Ensure `useUnifiedBookingAlerts` is initialized globally to prevent alert loss during transition between Home and Profile.

### Backend & Telemetry
-   **Enhanced Missed-Booking Diagnostics**: Update `report-missed-booking` to capture `notification_health` and `no_ack_count` to differentiate between network loss and silent background suppression.
-   **FCM Token Auto-Heal**: Ensure `worker-heartbeat` resets `fcm_token_status` to 'active' whenever a fresh token is uploaded, clearing any dispatcher blocks.

## Technical Details

-   Update `src/lib/workerId.ts` (new) to provide a standard `resolveWorkerId(supabaseUid)` helper.
-   Refactor `src/App.tsx` to initialize `initFCM` and global listeners at the top level.
-   Modify `src/hooks/useActiveJob.ts` to expose a `status` field for reliable movement monitoring triggers.
-   Update `src/services/bookingAlertCoordinator.ts` to include `app_version` in all ACKs for easier telemetry filtering.
