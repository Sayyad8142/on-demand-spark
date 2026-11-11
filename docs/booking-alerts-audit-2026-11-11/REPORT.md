# Booking alerts audit — booking d2d1dacc (11 Nov 2026, 17:42 IST)

Labels: VERIFIED (live data/logs) · SOURCE (repo code) · NOT VERIFIED.
Version audited: 10.0.03 (versionCode 103). Backup: `backup/booking-alerts-before-2026-11-11.zip` (SHA-256 manifest inside, verified).
Nothing deployed, published or changed on the server.

## Real booking (VERIFIED)
- Created 12:12:15 UTC, one batch of 4 at 12:12:17 (only 4 eligible), 60 s window to 12:13:17. Still `pending` at 12:23 — no one else to offer ("all_workers_already_requested").
- Sid (10.0.03, Samsung S23, Android 16): FCM accepted 12:12:18, phone received 12:12:19, popup_shown never, worker opened app 12:13:06 (11 s left), timed out.
- Nagarani m (10.0.02): FCM accepted; phone woke (heartbeat "fcm_received" 12:12:21, app opened 12:12:54) but no receipt confirmation was ever accepted by the server.
- Mafiya (7.0.4): last seen 8 Nov (3 days offline) yet still offered (connection group 4). Most likely never received it.
- Jyothi G (10.0.02): phone woke 12:12:19, rejected 12:12:21 (2.6 s). Native code only rejects on a tap, so an alert was very likely on screen; its confirmations were refused.

## Root causes
1. Small "New booking" popup (SOURCE): the full-screen pop-up needs the optional "display over other apps" permission. Without it, in the background Android blocks opening the booking screen (full-screen intent removed by policy), so only the plain "New Booking" notification shows. With the app open, the in-app path started the pop-up service, which played sound then silently quit with "Overlay permission required"; the app had no in-app card (removed Aug 2026), so the worker saw only toasts. Overlay permission is never reported to the server (null for all workers) — NOT VERIFIED per worker.
2. Wrong countdown (SOURCE): the in-app path sent no expiry/offer id to the pop-up, so it started a fresh 60 s timer even when the offer had 10 s left.
3. Overlap (SOURCE): booking screen title had no right-side limit and runs under the 80 dp timer on narrow screens / large text; timer text could outgrow its circle. NOT VERIFIED on a device.
4. Missing confirmations (VERIFIED): in 12:00–13:00 UTC the live receiver answered 401 to 129 confirmations and 200 to 10. Only 10.0.03's login-based retry gets through. Live receiver code differs from the repo copy (repo never returns 401 with a header) — must be downloaded to know why.
5. False "popup shown" (SOURCE): when the pop-up failed, the app reported popup_shown though nothing was on screen.

## Fixes prepared (preview/source only)
- `src/lib/nativeOverlayPayload.ts` + `src/hooks/useUnifiedBookingAlerts.ts`: real expiry + offer id passed; expired offers not shown; no false popup_shown.
- `OverlayPlugin.java`: forwards offer id, expiry, ack token.
- `BookingOverlayService.kt`: no overlay permission → opens the full booking screen (allowed while app is open) and reports `overlay_blocked`, instead of a silent toast.
- `MyFirebaseService.java`: booking notification removes itself when the offer expires.
- Layouts: title can't run under the timer; timer text shrinks to fit.

## Tests
501/501 pass (43 files), type check clean. Android not compiled here (no build tools).

## Needs a real Android phone
Foreground / background / locked / screen off / killed / battery saver, with and without popup permission; sound, vibration, timer accuracy, Accept/Reject, two offers together, expired offer, duplicate push.

## Open decisions / not changed
- Notification wording "New Booking" only and no Accept/Reject buttons are saved rules — kept.
- Full-screen over lock screen without popup permission is not possible under current policy (no full-screen intent).
- Dispatch offered a worker offline for 3 days; booking left pending with no further workers — dispatch rules not touched.
- Live `ack-booking-delivery` source needed before any server fix.
