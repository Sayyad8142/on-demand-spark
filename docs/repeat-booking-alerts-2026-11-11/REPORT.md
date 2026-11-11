# Second booking notification investigation — preview only

## Scope
No APK published, no functions deployed, no live bookings changed. Read-only production evidence only; local native tests never send FCM or call booking acceptance. Dispatch, server offer window and notification wording stay unchanged. Test-notification switches remain OFF.

## VERIFIED production evidence
Second booking `e11e9242-1752-4ae0-b874-17925838e77e` was created at 13:28:27.098 UTC (18:58:27 IST). Sid's distinct offer `4ab07e27-af18-4a3f-9b73-2d05ab98ad7f` opened at 13:28:27.902 and expired at 13:29:27.902: exactly 60 seconds. Receipt was recorded at 13:28:29.855, leaving approximately 58 seconds. Android 16, Samsung SM-S911B, reported version 10.0.03. It timed out without popup_shown or worker_seen. The booking was subsequently cancelled at 13:31:14.370.

The event table records push_sent and push_received, with no popup event. Receipt did not arrive too late. Missing popup telemetry alone does not prove the phone never displayed anything: reporting can fail. No native logcat was supplied; foreground state and overlay permission were not recorded for this offer. Recent receiver log searches for the booking and 401 returned no matches, not proof that the reported 401 failures stopped.

## Confirmed SOURCE defect; incident attribution remains NOT VERIFIED
Both native acceptance screens set a persisted ten-minute local busy flag. `clearLocallyBusy` had no callers. FCM BOOKING_CANCELLED/BOOKING_REASSIGNED notified the WebView but never released the native flag. FCM records push_received *before* checking busy; it then returns without queueing/displaying while busy. This directly explains how a received second offer can be suppressed after a cancelled first acceptance. The exact installed APK and phone logs are still needed to prove this was Sid's cause, rather than permission/reporting failures.

Two additional SOURCE lifecycle hazards were found: idle service mode marked the singleton as showing without any window; a service start arriving between cleanup and destruction retained isShuttingDown. Activity singleTop reused an existing screen without onNewIntent processing.

## Exact preview changes
- `BookingOfferLifecycle.java`: null-safe matching-booking rule, used for local lock release and open-surface cleanup.
- `OfferQueue.kt`: releaseEndedBooking removes matching accepted/busy markers, matching in-flight claim, old queue entry/notification and orphan active marker. A delayed first cancellation cannot release a newer accepted booking or delete its offer. It is used only for server cancellation/reassignment messages, not ordinary assigned callbacks.
- `MyFirebaseService.java`: performs native cleanup immediately on cancellation/reassignment, even with WebView paused/closed, then sends a booking-scoped local end signal; existing cancellation notification/voice retained.
- `BookingOverlayService.kt`: registers/unregisters the booking-end receiver; matching visible booking closes using existing cleanup. Idle no longer claims a visible window. Reused shutdown service resets per-offer state, including ACK/login/deadline references.
- `BookingAlertActivity.kt`: matching end signal stops audio/vibration/timer and retires the old screen; guards an uninitialized countdown on early finish. Reused singleTop intents queue a different valid booking; a retired screen recreates with the new offer rather than reusing old listeners/countdown/ACK identity.
- `android/app/build.gradle`: Robolectric test-only dependency and Android resources enabled for persisted-queue regression tests; runtime dependencies/permissions/version unchanged.
- Native tests: four matching/safety tests and nine production-queue tests. Queue tests cover accept→cancel→second, reject→second, timeout→second, dismissed→second, duplicate queue insertion, expired offer, unrelated cancellation, active-marker preservation, and matching acceptance claim release. These are not phone display tests.

## Verification
Initial run: all 501 frontend tests in 43 files passed. Native compilation and 21 tests passed (8 existing + 13 new); final run after Activity intent handling is recorded below. TypeScript native-preview project check passed with no errors. Preview build log shows build OK. The supplied use-mobile UMD message was not reproduced: current source imports useEffect/useState explicitly and contains none of the quoted prompt text; no unrelated hook edit was made.

Backup: six source files in `backup/before.zip`, archive bytes checked against original files, SHA-256 manifest beside it. Generated native test/compile output is removed after verification; XML/log evidence retained temporarily outside the repository.

## Remaining isolated real-phone checks — NOT VERIFIED
Use only an approved isolated backend/account/booking IDs, never this production-configured app against live customer bookings. The staged practice sender remains OFF and cannot verify real-offer acceptance/cancellation/ACK routing.

1. First alert→Accept→admin cancellation→second alert; ensure no ten-minute suppression and correct second offer ID/details/expiry.
2. First→Reject→second; first→Timeout→second; first→tray dismissal→second. A dismissed tray alone does not retire a still-valid on-screen offer; it remains queued until resolution/expiry.
3. Test foreground/background, lock/screen off, killed app, battery saver, with/without optional overlay permission. Without overlay permission in background, Android permits notification/tap, not guaranteed automatic full screen; no full-screen-intent bypass was added.
4. Verify sound/vibration stop for the first and start once for the second, correct timer, both actions, service restart, Activity singleTop/recreation, and no overlapping windows.
5. Deliver delayed duplicate pushes for the same offer across FCM/foreground/tray, including after rejection/dismissal; confirm no reopening. Current queue dedupe is verified only while an offer remains queued, so post-retirement replay still needs phone verification before release.
6. Expired arrival/tap never becomes actionable. Network acceptance retry remains bound to the original deadline.
7. Delay the first cancellation until the second booking is accepted: it must not clear second-booking busy protection. Test cancellation racing an in-flight acceptance separately.
8. Inspect phone logs for popup visibility and ACK HTTP status/auth mode only, never tokens. A failed ACK must not control presentation/actions. Download live receiver and its JWT settings to settle the ongoing 401 issue; no receiver or closing-hours rule was changed.

**NO-GO for release until these device checks pass.** Authenticated browser end-to-end checks are unavailable for externally managed Supabase, and browser rendering cannot prove Android service behavior.