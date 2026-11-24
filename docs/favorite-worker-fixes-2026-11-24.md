# Favorite Worker offer-safety preparation — 24 November 2026

## Final flow sweep

**Rule:** a real booking offer must keep its original server expiry everywhere; reopening, duplicate alerts and reconnection must not buy extra time, and only the server may confirm acceptance or rejection.

| Place reviewed | Source outcome |
|---|---|
| Home offer hook, shared web coordinator, realtime request listener and polling fallback | Use request/deadline generations; undated recovery and original expiry are retained. Confirmed rejection clears the pending state. |
| Web FCM foreground/tap handlers, parser and native payload builder | Absolute expiry only; undated FCM asks the existing poller to recover; taps do not fabricate receipt. |
| Web Accept/Reject helper and App deep-link acceptance | Session-derived own request preflight; original request/deadline cap; shared prepared endpoint adapter. Strict activation still blocked by the Admin grant. |
| Native FCM receiver, Overlay plugin, Overlay Service and Activity (including onNewIntent) | Missing expiry recovers the own row; live persisted intent retains original expiry; duplicates queue rather than restart; real rendering acknowledges separately. |
| Native OfferTimer, AlertPresentationRules, OwnOfferPreflight and persisted OfferQueue | No send-time/queue-time expiry; original-deadline acceptance; generation retirement preserves later offers; cross-booking single-flight/FIFO tested. |
| Native BookingNotifications and web bookingAlertFallback | Native tray carries the original intent and timeout; local fallback carries absolute expiry. Undated generic native notification opens the app only. |
| Native AckWatchdogWorker, BackendSync and web bookingAck/fcmAckTracker | Separate receipt, visible-popup and tap events. New native queued offers start the watchdog, duplicates do not restart it. Shared server logging certification remains pending. |
| Native push registration module and NativePushService | Registration/cancellation forwarding/listener wrappers only; neither independently accepts offers or starts a countdown. |
| App window-message handler | BOOKING_ALERT only logs; it does not create a second offer or acceptance path. Cancellation/reassignment stay on their existing handlers. |
| useBookingOfferVisible / offerAlertActive | Read-only update-interruption guard; its short display-safety cap does not authorize acceptance or set the offer countdown. Left unchanged. |
| Test Booking local state and PracticePushReceiver | Explicitly isolated practice lifetime, not a favorite/real offer. Kept unchanged, including example data and disabled production send switches. |
| Connected DB try_accept_booking / accept_booking / accept_booking_authoritative / reject_booking_offer / booking_offer_open and own-row policies | Definitions/privileges inspected read-only; strict grant, targeting race, worker concurrency, reservation release and truthful server logging dependencies remain as documented below. No backend changes. |
| Android bundled assets and shared packaging verifier | Verifier was executed and rejected stale assets. No synchronization, release packaging or publication was performed. |

This sweep found no additional independent real-offer countdown or acceptance implementation beyond those corrected/prepared above. Source inspection is not physical-device or authenticated end-to-end evidence. Existing settled records, permissions, settings, practice examples, Start OTP alarms, payouts and availability were left untouched. All earlier blockers remain in force.

## Result: prepared, not production-certified

The Worker App corrections below are prepared in source. Version **10.0.05 / 105** and package **app.didisnow.worker** are unchanged. No shared backend, dispatch, score formula, payout, availability, Start OTP alarm, signing or Firebase configuration was changed. No APK/AAB was packaged and nothing was deployed or published.

The reported `use-mobile.tsx` UMD diagnostic was not reproduced: the hook already imports `useEffect` and `useState` explicitly. The preview reports build OK and the mobile browser has no JavaScript error or Vite error overlay. No speculative hook edit was made.

## Prepared fixes — SOURCE + AUTOMATED evidence

- **Actual expiry only:** FCM and native timers no longer derive offer expiry from `sent_at + 60` or receipt/queue time. Undated web FCM asks the single existing polling reader to resync. Undated realtime offers read the verified login's own request. Native FCM, Activity and Overlay read the own server row off the UI thread. Failed/offline/expired-session recovery cannot create an actionable fresh countdown.
- **No restart or extension:** the native persisted queue canonicalizes duplicate/reopened intents to its original live request/deadline. Native acceptance takes the earlier of its original and reread deadlines; web acceptance also receives and caps to the original deadline and request identity. Existing request-generation dedupe remains, with bounded durable browser replay suppression added.
- **Closed/expired requests:** closed realtime requests are not surfaced. Web/native acceptance preflight refuses closed or expired own rows and rechecks expiry before sending. A new secure endpoint adapter is prepared for all web/native acceptance paths, including the web deep-link path; activation is held because the strict endpoint is not executable by workers today (see below).
- **Confirmed rejection:** the web pending state closes immediately and sends generation-specific native retirement. Native retirement removes that generation, popup/countdown/tray and queued record without marking the whole booking permanently taken or clearing a later server generation. Backend reservation release/escalation remains server-only. Unconfirmed failures retain the original retry window.
- **Simultaneous offers:** retained the existing cross-booking single-flight claim and native FIFO. Automated tests cover competing booking claims and successive offers. This does not prove cross-device/database concurrency safety.
- **Honest receipt/popup evidence:** genuine FCM receipt is acknowledged separately, including when expiry needs recovery; notification taps never fabricate a receipt. Poll/realtime recovery no longer inserts a legacy push receipt. Coordinator delivery no longer resolves a watchdog as `popup_shown`; actual visible rendering/native acknowledgments remain responsible. Duplicate/informational native receipts no longer restart the popup watchdog.
- **Fallback notifications:** carry the original server expiry; expired/undated local fallback notifications are not posted as actionable offers. Native failed undated recovery can retain an ordinary app-opening notification; it does not authorize acceptance.

## Executed checks — not inferred from source

| Check | Result |
|---|---|
| Full frontend suite: `bun run test` | **856 tests, 80 files passed** |
| Android Kotlin/Java compilation and Robolectric/JUnit suite | **87 tests, 10 suites, zero failures/errors/skips** |
| Additional isolated Java deadline/acceptance rules | **19 tests passed** (overlap with the Android suite; do not add totals) |
| Android web-assets verifier | **FAILED as expected: bundled assets stale/incomplete** |
| Latest preview compilation | **build OK** |
| Chromium mobile 393 × 805, `/home` | Redirected to `/auth`; no page errors or error overlay; screenshot inspected |
| Source version/package and untouched release configuration | 10.0.05 / 105; application ID unchanged; no version/config diff |

Native command: `ANDROID_HOME=/tmp/prompt-127-sdk bash gradlew :app:testDebugUnitTest -x :app:verifyWorkerWebAssets --no-daemon`, with temporary Java 21 and Android SDK 36. **The asset guard was excluded only for native unit testing, never for packaging.** These tasks compile test classes, not a release APK/AAB. Deprecation warnings remain, but compilation succeeded. Generated test output is not part of the delivered source changes.

The asset verifier reports missing `push-guard-native-resume`, `manual-repair-readback`, `Booking_alert_connection_needs_attention`, Start OTP and mandatory-approval markers. No current production `dist` was built or synced in this request. The existing release freshness guard was preserved, not weakened. A later separately authorized release needs a successful current web build, Capacitor sync, and the full unexcluded guard before packaging.

## Fresh connected-database inspection — READ ONLY

1. `try_accept_booking(uuid)` currently delegates directly to `accept_booking_authoritative(uuid, NULL)`. Its targeting predicate allows a still-pending expired offer and does not provide strict expiry enforcement; the prior audit finding remains unresolved in the shared backend.
2. `accept_booking(uuid)` exists, resolves the worker from the authenticated session, locks the booking, requires an active own request with `timeout_at > now()`, and delegates to the existing authoritative assignment function. **`authenticated` currently has no EXECUTE permission for this strict wrapper.** The authoritative core is also not directly executable by workers. `try_accept_booking`, `reject_booking_offer` and `booking_offer_open` are executable by authenticated workers.
3. Both worker UPDATE policies on `booking_requests` check ownership only. They do not protect expiry/lifecycle columns. A phone-side preflight is defense in depth, not a security boundary against forged writes.
4. The authoritative assignment function checks another active booking before updating/locking the worker row. The inspected booking unique indexes cover the primary key and previous-booking linkage, not overlapping assignments. Cross-device simultaneous assignment is still an Admin-owned dependency.
5. `booking_offer_open` checks booking pending/unassigned state, not the own request deadline/status. Native acceptance additionally reads the own request, but the shared polling contract still needs backend certification.

## Admin Panel handoff — PROPOSED, NOT DEPLOYED

The two strict-accept switches remain **OFF**: `SECURE_OFFER_ACCEPTANCE_ENABLED` (web) and `OfferAcceptanceContract.SECURE_ENABLED` (Android). Prepared approved mode calls only `accept_booking` with `p_booking_id`; it never sends a worker identity and never falls back to the legacy endpoint after a strict-endpoint refusal/error. Until Admin approval and the worker grant, existing production calls are retained to avoid disabling all worker acceptance. **Therefore the request to activate secure acceptance on every path is not yet completed.**

Admin must own and certify:

1. The final authenticated acceptance contract, strict expiry/closed-request enforcement under locks, idempotent retry/readback, and preserved operating-hours, approval, eligibility, favorite reservation and normal assignment rules. Either certify/grant the strict wrapper or harden the existing public entry point; do not merely grant an unreviewed contract.
2. Protection of server-owned `booking_requests` expiry/lifecycle fields while keeping approved receipt reporting available.
3. Worker-level serialization before active-booking checks and authoritative protection against overlapping assignments from different phones/bookings.
4. Reservation release and normal fallback after confirmed favorite rejection, timeout or suppressed favorite insertion; scheduled-favorite dispatch coverage. The Worker App does not dispatch or clear reservation fields.
5. Lifecycle logging without acceptance backfilling `push_received`/`popup_shown`, plus actual `timed_out` events and truthful miss classification. No local priority/rating deduction was introduced.
6. Authoritative absolute expiry and request identity in all actionable transports and the pending-offer reader; a delayed notification's send time must not define a new window.

Workspace search for the Admin Panel returned only the customer app `user-didi-now5`; its read-only snapshot was inspected for context, not treated as the Admin authority and not modified. An Admin project question is open. This document is the handoff; no Admin agreement, backend deployment or production race fix is claimed.

## Phone-state matrix — NOT VERIFIED on physical hardware

| State | Source/automated protection | Required physical evidence |
|---|---|---|
| Foreground | Absolute expiry, shared coordinator, original-deadline acceptance | One actual FCM offer, one popup/sound, genuine receipt + visible ACK, server assignment readback |
| Background | Native own-row expiry recovery, FIFO and notification fallback | App backgrounded, real delivery, permitted popup/tray behavior and unchanged sound |
| Locked screen / Doze / OEM saver | Existing presentation policy and timer rules retained | Actual locked phone/Doze/OEM tests; no new full-screen or location permission |
| Disconnected | Undated recovery fails closed; no fresh local TTL; acceptance failure is not success | Offline offer/tap, verify no assignment/deduction and original countdown expires |
| Reconnecting | Single existing poller/resync, durable request/deadline dedupe | Network restoration before and after expiry; duplicate FCM/realtime/poll delivery produces one offer |
| Process restart / reopen | Persisted native original deadline and browser replay suppression | Kill/reopen with a current installed APK; no fresh 60 seconds or replayed audio |
| Two simultaneous offers/phones | Device-wide claim/FIFO automated checks; backend concurrency unresolved | Approved isolated two-phone/two-booking race, exactly one overlapping assignment allowed by contract |

No authenticated customer → favorite selection → worker Accept/Reject → server readback was run: the browser check reached sign-in and the environment provides no managed worker session. No real push was sent, no worker booking was mutated, and no physical phone, locked-screen, disconnected/reconnecting, audible alarm or installed-binary verification is claimed.

Before a future native check, update the local project from the connected repository and sync only after an approved current web build (`npx cap sync android`); do not package or publish during this preparation. Native setup reference: https://lovable.dev/blog/capacitor.