# Approved preview-only continuation — prompt 85

## Result
**GO for preparing controlled real-device testing; NO-GO for publishing or live booking tests.** No APK published, no server function deployed, no dispatch changes, no customer booking created or accepted. Practice sender and client delivery switches remain OFF.

## VERIFIED here
- Java 21 and Android SDK 36 installed temporarily; Gradle 8.11.1 / AGP 8.9.2 compiled Kotlin and Java successfully.
- Regenerated stale Capacitor plugin paths with `cap update android`; also includes the installed speech plugin.
- `:app:testDebugUnitTest :app:assembleDebug`: BUILD SUCCESSFUL. Version remains 10.0.03 / build 103. Debug APK was not published and is kept only in temporary build evidence, not committed.
- Native tests: 8 passed, 0 failures. Real deadline takes precedence, expired = 0 (not the old five-second minimum), last second stays one, delayed callbacks do not extend expiry, sent-time fallback, foreground/locked launch rules, visible-only acknowledgment gate.
- Frontend: all 501 existing tests passed in 43 files, including the strengthened regression that listener delivery must not claim the alert was opened.
- TypeScript project check passed; preview build OK. The reported UMD message was not reproduced; `use-mobile` now uses explicit named React imports rather than a React namespace.
- Generated Android build folders removed after verification because APK/dex outputs exceed repository size limits.

## SOURCE changes (compiled, device behavior NOT VERIFIED)
- Foreground with no overlay permission: the Capacitor plugin opens BookingAlertActivity directly from the resumed Activity instead of relying on a service launch. Notification posted first as backup.
- Background/locked without overlay permission: no automatic Activity-launch attempt; high-priority notification with the booking-specific tap target. No full-screen intent added. Notification access/channel settings and OEM restrictions still apply; a denied notification permission cannot be bypassed.
- Shared native BookingNotifications path: title/body `New Booking`, no Accept/Reject tray actions, sound/vibration, same booking notification ID, only-alert-once, original expiry timeout, booking-specific details on tap.
- Activity/overlay countdown reads a fixed original deadline on every callback, rather than decrementing a counter that drifts after sleep or delayed work.
- Activity acknowledgment requires attached, shown, focused, non-closing view and unexpired offer; overlay acknowledgment waits for draw. Receiving coordinator data no longer claims worker_seen/opened.
- Existing title/timer bounding and text auto-sizing retained. Native layout resources compiled, but large-text visual appearance needs phone testing.
- FCM duplicate offers return before reposting the tray notification. Booking payloads and service extras no longer log signed tokens.

## 10.0.02 HTTP 401 investigation
**PRIOR evidence:** earlier live audit saw 129 refused confirmations versus 10 accepted within 12:00–13:00 UTC. Older-device check-ins proved receipt/wake, not successful acknowledgment.

**SOURCE:** current receiver copy only rejects missing Authorization, while earlier live response was `unauthenticated` with a hint to send an ack_token or valid worker session. Therefore the repository endpoint is not sufficient to explain production failures. Current client uses signed offer token first and one session retry for delivery events; queues missing/expired login until refreshed on open. No receiver edits or synthetic live acknowledgment requests were made.

**Important uncertainty:** the older handoff itself names build 102 and describes session fallback, so version string 10.0.02 alone does not prove fallback is absent. Compare the exact installed APK/hash with that release source, inspect phone ACK logs (event, auth mode, HTTP status only), and download the current live receiver plus deployment JWT settings. Token expiry/signing validation, session freshness, ownership checks and gateway JWT enforcement are hypotheses, not confirmed root causes. No live source download was supplied for the receiver in this task.

## Remaining failures / real-device checklist
No compiler errors or test failures remain. Android deprecation/unused-parameter warnings remain; no blanket cleanup performed.

**NOT VERIFIED:** full-screen foreground appearance, notification tap end-to-end, large fonts, sound/vibration, screen-off/locked/killed/battery saver, duplicate race across FCM and foreground, two different offers, acceptance/rejection, expired notification tap, and production ACK compatibility. No Android device or emulator was available; authenticated browser verification is unavailable for this externally managed Supabase project.

Use an isolated backend/test account and isolated booking IDs only. Never install this production-configured debug artifact for simulated live actions. Point the test build at approved isolated services before device tests; the existing isolated practice sender remains undeployed/OFF and cannot currently prove real-offer notification/ACK handling.

1. Foreground with overlay denied: complete screen opens; details and both actions visible.
2. Background/locked/screen off with overlay denied: notification only; tap opens the correct still-valid offer.
3. Repeat with overlay allowed and notification denied/channel blocked; record Android limitations without bypassing permissions.
4. Deliver with 11 seconds left, pause/resume, tap an expired offer: never a new 60-second/five-second window.
5. Narrow phone and largest supported text: title/timer separate; scroll reaches Accept/Reject.
6. Duplicate same offer, FCM+foreground race, two offers: one presentation/sound per offer, no competing acceptance.
7. Confirm popup_shown absent when blocked/closed and recorded only after visible; test token refused → session fallback on isolated receiver only.
8. Sound/vibration stop after each action/expiry; retryable acceptance keeps only unexpired offers.

## Local build guidance
Update your local project from the connected repository first, then run `npx cap sync`. Build/test locally with Java 21 and SDK 36; use the isolated configuration above. Read the [Lovable native mobile guide](https://lovable.dev/blog/capacitor).

Backup: `backup/prompt-85-before.zip`, eight source/generated configuration files with verified SHA-256 manifest. No signing key used beyond the default local debug signing; no release artifact distributed.