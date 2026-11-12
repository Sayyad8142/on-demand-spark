# Prompt 94 — Worker App Dispatch Compatibility Fixes

**Scope: PREVIEW ONLY. Decision: NO-GO for integrated device testing today; GO for isolated automated checks.**

No production deployment, database changes, notifications, bookings, APK publication, or changes to assignment, ranking, availability, OTP or payments were performed. No APK was packaged. Existing practice-sending switches were not changed.

## Reported hook error
**VERIFIED:** `src/hooks/use-mobile.tsx` already imports `useEffect` and `useState` explicitly. Vite served the transformed module successfully and the latest preview log reports `build OK`. The quoted UMD-global error was not reproduced; the hook was not edited. This is not a separate manually run TypeScript check.

## Backup
Nine existing affected files were copied before editing to `backup/` with `SHA256.json`. All backup checksums were verified. New files have no pre-edit version.

## Exact source files changed
Modified:
- `src/lib/fcm.ts`
- `android/app/src/main/java/app/didisnow/worker/AlertPresentationRules.java`
- `android/app/src/main/java/app/didisnow/worker/BookingAlertActivity.kt`
- `android/app/src/main/java/app/didisnow/worker/BookingOverlayService.kt`
- `android/app/src/main/java/app/didisnow/worker/MyFirebaseService.java`
- `android/app/src/main/java/app/didisnow/worker/OfferQueue.kt`
- `android/app/src/main/java/app/didisnow/worker/OverlayPlugin.java`
- `AGENTS.md`
- `roadmap.md`

Added:
- `src/lib/fcmOffer.ts`
- `src/lib/__tests__/fcmOffer.test.ts`
- `src/lib/__tests__/fcmRouting.test.ts`
- `android/app/src/test/java/app/didisnow/worker/OfferAcceptanceDeadlineTest.java`

Documentation/evidence: this report, nine-file backup plus checksum manifest, and five test/tool logs under `docs/dispatch-compatibility-2026-11-12/prompt-94/`.

## Prepared changes
**SOURCE + AUTOMATED JS VERIFIED:** Foreground receive and notification tap share one normalizer. Epoch-second, epoch-millisecond and ISO expiry are converted to the same absolute deadline. Original sent time plus TTL is accepted without anchoring to receipt/tap time. Missing, malformed and expired deadlines are refused on the JS FCM offer path; realtime/polling paths are unchanged. Customer/price aliases and `offer_booking_type` preserve the restoration sender’s real scheduled type despite its `booking_type=instant` compatibility label.

Only `BOOKING_ALERT` can enter the offer coordinator. Informational messages cannot open an offer. Cancellation taps dismiss the matching JS alert and emit the existing cancellation event; reassignment uses the existing handler. Native cancellation/busy-lock release, notification IDs, queue identity and assignment RPC remain unchanged. Signed tokens are extracted/forwarded through the existing ACK helper, not invented or generated.

**SOURCE + PURE JAVA VERIFIED; ANDROID INTEGRATION NOT VERIFIED:** Both native Accept buttons check the fixed original deadline before claiming acceptance. They check again after session refresh and immediately before writing the acceptance request. A failed Activity acceptance resumes countdown/status checks only while that deadline remains open. Overlay retry uses remaining time from the absolute deadline rather than subtracting elapsed time from a stale count. Expired retries close rather than send. Existing successful server responses remain the authority; expiry is not used to undo a server-confirmed win.

Native FCM consumes the actual scheduled kind, customer/request aliases, and passes scheduled date through direct Activity, service, bridge and queue replay. The service-failure fallback now retains `flat_no` rather than substituting legacy `location`.

## Tests and checks
- **PASS:** `bun run test`: 49 files, **553 passed, 0 failed** in the final run.
- **PASS:** new FCM contract tests cover absolute expiry, delayed taps, IDs, customer/price/schedule and non-offer filtering.
- **PASS:** mocked actual Capacitor receive/tap listeners reach the coordinator with the same deadline and opaque signed token; expired taps do not reach it. Cancellation/reassignment taps never become offers. All external services were mocked; this is not real FCM/device evidence.
- **PASS:** isolated JUnit execution of existing `AlertPresentationRulesTest` and new `OfferAcceptanceDeadlineTest`: **12 passed, 0 failed** using Java 21, without Android services.
- **Initial test failure, corrected:** one listener test compared ISO strings with/without `.000` although they represented the identical instant. The assertion now compares canonical ISO formatting; all tests pass.
- **BLOCKED, not an application test failure:** Android `testDebugUnitTest`, `compileDebugKotlin`, `compileDebugJavaWithJavac` were attempted. Minimal JRE first failed the Gradle download TLS handshake. Full JDK downloaded Gradle, but the online attempt did not complete within the observed window; the bounded offline attempt failed because `com.android.tools.build:gradle:8.7.1` for Capacitor Filesystem was not cached. Android SDK is also not configured in this sandbox. **Full Android compilation and all Robolectric tests were not completed.** No claim that prior native test results apply to these changes.
- **PASS:** current Vite module response for the reported hook; preview `build OK`.
- **NOT VERIFIED:** authenticated production workflow, real FCM delivery, rendered native popup, sound, tray tap, lock-screen/cold-start, cancellation/repeat-offer or installed APK behavior. No phone/emulator or isolated end-to-end services were available. No production call was used to exercise these changes.

## ACK compatibility and backend dependencies
1. **PRIOR AUDIT + CURRENT SNAPSHOT SOURCE:** proposed restoration sender does not mint `ack_token`. Backend owner must supply a signed, offer-bound token using the receiver’s actual supported contract; app must not mint credentials. Existing app forwards `ack_token` with original booking/request identity. Arbitrary token schema/signature compatibility is not proven by client-side tests.
2. **PRIOR LIVE READ, not reverified in this turn:** `try_accept_booking` delegates to permissive acceptance logic that may accept expired pending requests. Backend must enforce the original request deadline atomically and authenticate the worker server-side. Client clock checks cannot secure older APKs or a request that arrives after expiry.
3. Receiver must verify signature, worker, booking/request binding and expiry, and support delivery-only session fallback. Closed-app + expired-session confirmation still depends on a valid signed token; no credential is fabricated to cover its absence.
4. Obtain current deployed sender/receiver/acceptance exports and verify them against reviewed contracts. No backend was edited or deployed here.
5. Sender must continue supplying reliable absolute expiry and scheduled/display fields. JS now refuses undated offers rather than extending them. Legacy native missing-deadline TTL fallback remains unchanged and is not a substitute for the server deadline contract.

## APK requirement and isolated testing decision
**New native APK required: YES.** Java/Kotlin changes cannot reach installed phones through a web preview or JS-only OTA. An isolated test build must be compiled and installed after these checks succeed; no production APK was changed.

**NO-GO for integrated isolated device testing today:** full Android compilation/unit suite is blocked; a real isolated device/test service pair is not available; server deadline/ACK dependencies are unresolved. **GO for local mocked/pure-rule checks only. NO-GO for publishing or production integration.**

After prerequisites are supplied, use only an isolated backend and approved test phone: verify foreground receive and tray tap show the original remaining time; last-second Accept followed by a slow refresh sends no expired request; valid network-error retry resumes countdown; expired retry closes; informational/cancellation/reassignment messages never become offers; cancellation and completion permit a different subsequent offer; ACK token remains unchanged and popup_shown is recorded only after visible rendering. Verify normal, background, locked, cold-start and repeated-offer cases. Do not create real bookings or send production notifications under this approval.
