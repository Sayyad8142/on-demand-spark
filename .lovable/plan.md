# Plan: Restore Fleet Reachability & Booking Delivery Reliability

The system is currently below production threshold (reachability < 10%). This plan implements a high-frequency heartbeat, active-offer recovery path, and enhanced telemetry to restore fleet reliability.

## PART 1 - Heartbeat Frequency & Reliability
- Increase `useWorkerHeartbeat` frequency from 30m to 2m.
- Backend (`worker-heartbeat` edge function) already clears `stale_device` and `no_ack_count` on any heartbeat. This change ensures workers who are actually online are marked eligible within 2 minutes of opening the app.
- Native `HeartbeatWorker.kt` (15m interval) already provides background coverage.

## PART 2 - Active Offer Recovery (Pull Path)
- Update `useUnifiedBookingAlerts` to fetch valid pending offers from the server on:
  - App open / mount
  - Foreground resume
  - Network reconnection
  - Periodic 30s interval while app is open
- This ensures that even if FCM delivery fails, the worker sees the offer as soon as they open the app or return to it.
- Deduplication is handled by `bookingAlertCoordinator.ts`.

## PART 3 - Admin Telemetry Improvements
- Update `AdminDispatchTelemetry.tsx` to highlight "Fresh" workers (heartbeat within 3m).
- Add a counter for Fresh workers to the dashboard to track production gates.
- Highlight delivery delays (Delta) in red/amber for easier auditing.

## PART 4 - Versioning & Rollout
- Bump app version to **6.0.64** (versionCode 64).
- Internal validation on Sid device (+91 78948 96396).

## Technical details
- `src/hooks/useWorkerHeartbeat.ts`: Interval changed to 2m.
- `src/hooks/useUnifiedBookingAlerts.ts`: Added `fetchValidOffers` logic with app-lifecycle listeners and 30s interval.
- `src/services/bookingAlertCoordinator.ts`: Added `recovery` source for telemetry.
- `src/lib/scheduledBookingGuards.ts`: Added `recovery` source type.
- `src/pages/AdminDispatchTelemetry.tsx`: Added 3m freshness indicators.
- `src/config/version.ts` & `android/app/build.gradle`: Version bump to 6.0.64.
