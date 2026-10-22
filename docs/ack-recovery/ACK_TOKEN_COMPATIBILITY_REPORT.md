# Worker App ↔ live ACK receiver — signed-token compatibility report
Date: 2026-10-22 21:20 UTC · Source: Worker App repo (versionCode 102 / versionName 10.0.02) · Nothing deployed, published or changed.

Labels: SOURCE = read in code · TESTED = automated test · NOT VERIFIED = no device/live evidence.

## Summary (forward this)
1. The app DOES read `ack_token` from FCM and echoes it unchanged in every confirmation (native + web). SOURCE + TESTED.
2. The app does NOT have a working "valid worker session" fallback for confirmations. Native sends only the public anon key; the web path sends whatever the Supabase client holds (no Firebase ID token is attached). SOURCE.
3. Therefore, against the live receiver (requires ack_token OR session): **confirmations succeed only when the push carries `ack_token`.** Until the alert sender attaches `ack_token`, every confirmation from every app version is refused (401) — this matches the 0 `push_received` seen live.
4. Recommendation: deploy the sender with `ack_token` (it is backward-compatible: older apps ignore unknown FCM keys). Optionally, receiver could also accept a Firebase ID token as the "session" — the app would need a change to send it.

## Answers
| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Reads `ack_token` from FCM? | Yes. Key `ack_token` (alias `ackToken` on web). Blank/non-string/>2048 chars ignored. | `MyFirebaseService.java:218-219`; `src/lib/bookingAck.ts:53-71`; `src/lib/fcm.ts:37-38,104-105` |
| 2 | Same token on push_received / popup_shown / seen? | Yes, unchanged in body field `ack_token`. Note: app event name is **`worker_seen`**, not `booking_seen`. | Native: `MyFirebaseService.java:224` (push_received), `BookingOverlayService.kt:698`, `BookingAlertActivity.kt:307` (popup_shown), `BackendSync.kt` body builder. Web: `bookingAck.ts:175,290` (explicit or remembered token), `bookingAlertCoordinator.ts:158-160,335` |
| 3 | Preserved for background / delayed ACKs? | Yes. Passed via Intent extras to overlay/activity; stored with the offer in `OfferQueue.kt:89-91,123-124`; stored in durable `AckQueue` (SharedPreferences, 24 h max, max 100, dropped when token `exp` passed — `AckQueue.kt:30,50-53,192`). Web keeps it in memory keyed by booking/request id, discarded when expired. | SOURCE + TESTED (`ackToken.test.ts`) |
| 4 | Missing/invalid/expired token → retry with session? | **No.** Missing token: still sent, but with anon key only (native `BackendSync.kt` sets `Authorization: Bearer ANON_KEY`); web `supabase.functions.invoke` carries no Firebase token (`src/integrations/supabase/client.ts` has no `accessToken` hook). 401/403 → REJECTED, logged, dropped, never retried with same token (`BackendSync.kt classifyAckHttp`). Expired token is not sent; ACK goes token-less → 401 under live receiver. | SOURCE |
| 5 | No uncontrolled retries / duplicates? | Yes. Native: 1 send, then WorkManager backoff only for network/5xx/408/429, bounded (24 h, 100 entries, generation counter cleared on logout). 400 → one legacy-name retry only for delivery events. Web: per (request, event) dedupe set; removed only on failure so a later lifecycle event may retry once. Accept/reject taps never re-sent. | SOURCE + TESTED |
| 6 | Versions with signed-token support | Phase 1C code (versionCode ≥ 102 build from this repo, not yet on Play). Live devices are on earlier builds (e.g. v7.0.0 seen live) — those do NOT read `ack_token`. | SOURCE; install base NOT VERIFIED |
| 7 | Older versions? | They ignore `ack_token`, send old-style bodies with anon key → live receiver 401. Bookings still display and Accept/Reject still work (separate RPCs); only delivery confirmations are lost. | Live probe (prior report) + SOURCE |
| 8 | Notification received but cannot confirm? | (a) sender omits `ack_token` (today: always); (b) older app version; (c) token expired before delayed retry (offline > token lifetime); (d) offline > 24 h; (e) app force-stopped (FCM not delivered at all); (f) token >2048 chars or malformed; (g) logout clears queue. | SOURCE |

## Contract the sender must meet
- FCM data key `ack_token`, string ≤ 2048 chars, JWT-style with `exp` (app reads `exp` only to stop retrying; it never validates the signature).
- Token must be accepted for `push_received`, `popup_shown`, `worker_seen`, plus `popup_failed`, `overlay_blocked`, `accept_tapped`, `reject_tapped`, `offer_expired` (all sent with it).
- Body also carries `booking_id`, `booking_request_id`, `event_type`, `app_version`, optional `worker_id` (receiver must trust the token, not `worker_id`).
- Lifetime: recommend ≥ offer TTL + a few minutes; longer if delayed offline ACKs matter.

## Tests
`bunx vitest run` → 11 files, **151/151 passed** (incl. `src/lib/__tests__/ackToken.test.ts`, `ackLegacyAndAvailability.test.ts`). Kotlin/Android code: NOT compiled or run here. No device test. No live traffic since token sender is blocked — real behaviour NOT VERIFIED.
