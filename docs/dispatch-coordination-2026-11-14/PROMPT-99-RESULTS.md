# Prompt 99 — approved preview-only Worker App corrections

## Decision and boundaries

**GO for preview preparation only. NO-GO for release, production integration, real notifications or APK publication.**

The five approved corrections and native acceptance preflight are implemented in the new Worker App source. No live backend, old Worker App, OTP, payout or availability rules were changed. `supabase/functions/` was not edited. `NEXT_BOOKING_LIVE_ENABLED` remains `false`.

The reported `use-mobile.tsx` TS2686 phrase is **NOT REPRODUCED**: the hook already uses named `useEffect` and `useState` imports. No speculative hook change was made. Latest observed preview compilation is **PASS**.

## SOURCE: corrections

1. Presentation dedupe uses booking + request identity + absolute server deadline. Exact duplicates stay retired; a later generation is distinct. Realtime pending UPDATEs use the existing coordinator (not another poller). Expiry is rechecked after asynchronous reads. Closing an expired/rejected request does not permanently mark its booking assigned; delayed closure of an older deadline does not dismiss a newer visible generation.
2. Confirmed rejection no longer calls `notify-next-tier`. The existing rejection RPC remains the sole owner of server escalation.
3. Web acceptance resolves the current session's exact linked worker, reads only that worker's booking request, and refuses missing/closed/expired offers before the existing accept RPC. Read/network failures are retryable.
4. Simulated countdown derives from the supplied absolute deadline instead of restarting a local 30-second timer. Unified alert data preserves that deadline.
5. Stable server refusals distinguish closed/gone from retryable failures. Device acceptance claims are single-flight across bookings, including native surfaces. Native acceptance verifies the JWT through Auth, resolves exact `workers.user_id`, reads that worker's offer, and caps the original deadline with the server deadline; it never extends it.

Request-generation retirement leaves native popup cleanup to its existing original-deadline countdown and booking-status poll; it deliberately does not call the booking-wide `cancelBookingOffer` command, which permanently marks a booking taken. Physical-phone timing/parity for this case remains **NOT VERIFIED**.

## Current test evidence

| Check | Result | Scope |
|---|---|---|
| `bun run test` | **627 passed**, 57 files | Complete frontend suite, final rerun |
| Android `testDebugUnitTest` | **52 passed**, 0 failures/errors | Kotlin/Java compilation plus Robolectric/JUnit; includes 18 repeat-queue and 4 new native acceptance-rule tests |
| Staged ranking Deno tests | **29 passed** | Isolated handler security suite, Deno type checking enabled |
| Other offline Deno suites | **104 passed** | Sender/relay/auth/FCM/practice/heartbeat tests; `--no-check` because mixed historical suites contain Bun-specific `import.meta.dir` typing |
| Existing offline priority suites | **148 passed** | Bun-run priority tests, 473 assertions |
| Worker Focus / ACK recovery | **40 passed** | Isolated Bun handlers |
| Reject core/flow + completion lock SQL rehearsals | **34 passed** | Existing tests and SQL copied into `/tmp`, PGlite installed there only; no hosted writes |
| Preview compilation | **PASS** | Latest observed build log after source edits |
| Browser public mobile check | **PASS, limited** | 393×805; `/home` redirects to sign-in, no page errors or horizontal overflow; screenshot inspected |
| Signed-in real booking Accept/Reject | **NOT VERIFIED** | External unmanaged authentication; no supplied authorized session or isolated test service |
| Native preflight real HTTP / real-phone end-to-end | **NOT VERIFIED** | Source and compilation checked; tests cover pure status/deadline/error rules, not real authenticated networking |
| Diff whitespace check | **PASS** | `git diff --check` |

Initial native test run had one repeat-queue assertion failure; the final complete native rerun above passed. Earlier mixed Deno invocation lacked read permission; the bounded-read rerun passed. Initial SQL tests could not resolve PGlite; isolated copies beside the temporary dependency passed. Those initial failures are not hidden or counted as passing runs.

Android tools were installed under `/tmp` for compilation/testing. Generated `android/app/build`, `android/build`, plugin build output and Android Gradle cache were removed; the oversized `apk-for-local-test.ap_` is absent. No release APK/AAB was built or published; app version and signing settings were not changed.

## Exact files changed for Prompt 99

### App source
- `src/lib/offerGeneration.ts` (new)
- `src/services/bookingAlertCoordinator.ts`
- `src/lib/bookingActions.ts`
- `src/lib/acceptOutcome.ts`
- `src/lib/deviceAcceptLock.ts`
- `src/components/SimulatedOverlayModal.tsx`
- `src/hooks/useBookingRequestsRealtime.ts`
- `src/hooks/useUnifiedBookingAlerts.ts`

### Native source
- `android/app/src/main/java/app/didisnow/worker/OfferQueue.kt`
- `android/app/src/main/java/app/didisnow/worker/OfferAcceptRules.java` (new)
- `android/app/src/main/java/app/didisnow/worker/OwnOfferPreflight.kt` (new)
- `android/app/src/main/java/app/didisnow/worker/BookingOverlayService.kt`
- `android/app/src/main/java/app/didisnow/worker/BookingAlertActivity.kt`

### Tests
- `src/lib/__tests__/bookingActionsAuth.test.ts`
- `src/lib/__tests__/acceptanceClosed.test.ts`
- `src/lib/__tests__/acceptFlow.test.ts`
- `src/lib/__tests__/offerGeneration.test.ts` (new)
- `src/lib/__tests__/offerCoordinator.test.ts` (new)
- `android/app/src/test/java/app/didisnow/worker/RepeatBookingQueueTest.java`
- `android/app/src/test/java/app/didisnow/worker/OfferAcceptRulesTest.java` (new)

### Tracking / handoff
- `AGENTS.md`
- `roadmap.md`
- `docs/dispatch-coordination-2026-11-14/PROMPT-99-RESULTS.md` (this report)
- `docs/dispatch-coordination-2026-11-14/ADMIN-PANEL-OFFER-CONTRACT.md` (new)

## Required Android phone verification — NOT VERIFIED

Use only an approved isolated account/device and separately approved test sending/build. Do not send real customer offers to verify these changes.

- Deliver the same generation via FCM + realtime + resume: one popup, one countdown, one sound stream.
- Reoffer the same booking/request with a genuinely later server deadline after expiry/rejection: a new popup, without reviving the old generation. Exercise pending UPDATE, not just INSERT. Confirm old delayed closure cannot cancel the new popup.
- While a popup is visible, deliver another offer: never concurrent popups; verify native FIFO behavior and original expiry.
- Tap Accept from Activity/overlay/web concurrently: one device-wide attempt; retryable failures preserve the unexpired offer and release the attempt claim.
- Refresh/login failure, 401/403, slow worker/request reads, malformed deadlines and expired deadline during refresh: no unauthorized/late accept RPC; retry only while the original window is valid.
- Worker A sees only A's offer; B's pending row cannot authorize A's acceptance. Verify native exact identity lookup with production-compatible RLS on isolated services.
- Verify stable offer-expired / already-assigned / not-offered / offer-closed / request-not-found / operating-hours-closed responses, versus timeout/5xx retries.
- Reject: server confirms once; client never calls `notify-next-tier`; server escalation observed independently.
- Acceptance by another worker closes matching popup/queue/tray. Successful own acceptance survives status events; completion/cancellation releases busy lock only for that booking; three consecutive bookings remain possible.
- Foreground/background/locked screen/process restart: sound, visible-only ACK, timeout cleanup and queue drain. Check EN/HI/TE and confirm unchanged Start/End OTP, money and availability flows.

## Remaining gates

Admin Panel coordination has been prepared as the accompanying contract handoff, **not represented as confirmed**. Its owner must confirm hosted source parity, deadline/generation semantics, RLS and stable RPC errors before release. A real approved Android device and authorized test environment are still required. Release, production changes and notification sending require separate approval.