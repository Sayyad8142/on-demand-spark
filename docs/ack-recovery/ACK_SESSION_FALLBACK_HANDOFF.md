# Booking-confirmation login fallback — Worker App build 102 (NOT deployed)
Date 2026-10-22 · Labels: SOURCE / TESTED / LIVE PROBE / NOT VERIFIED

## 1. Receiver contract — what was confirmed
LIVE PROBE (fake IDs, nothing written): live `ack-booking-delivery` answers `401 {"error":"unauthenticated","hint":"send ack_token or a valid worker session"}` for: anon key; garbage Bearer; `x-firebase-token` header; `firebase_id_token` body field. It does NOT reveal which session format it accepts. A real worker login could not be tested from here (no worker session available in this environment).
**ASSUMED contract (must be confirmed by Admin Panel dev):** `Authorization: Bearer <Supabase session access_token>` — the same login the app already uses for `complete-booking-v2` and booking RPCs (`src/lib/otpV2.ts`). The app does NOT send a raw Firebase ID token anywhere.

## 2. What the app now does
| Situation | Behaviour |
|---|---|
| Valid ack_token | Unchanged: one request with `ack_token` (anon key on native). |
| No ack_token | Request sent with the worker login in `Authorization: Bearer` (web: refreshed first if expiring; native: from stored login). |
| ack_token refused (401/403: invalid, expired, unknown) | ONE retry with the login, body WITHOUT `ack_token` and WITHOUT `worker_id`. |
| Token expired while queued (native) | Delivery events kept without the token and sent with the login; other events dropped. |
| Login expired in background (native) | Kept in the bounded queue (24 h / 100 entries / attempt caps), flushed on app open / resume / heartbeat / boot once AuthContext refreshes the login. |
| Logged out | Login removed + queue cleared (generation counter) → nothing sent. |
| accept_tapped / reject_tapped / offer_expired | Never sent through the fallback; never re-sent. |
| Duplicates | Web: per (request, event) dedupe; native: queue dedupe + one fallback per attempt. Max 2 requests per attempt. |
| Logs | Tokens and login never logged (only event + HTTP code). |

## 3. Receiver requirements (Admin Panel dev)
1. If `ack_token` present and valid → use its worker/request claims.
2. Else verify `Authorization: Bearer` JWT (Supabase session) → derive worker via `workers.user_id = sub OR workers.id = sub`. **Ignore any body `worker_id`.**
3. Check the booking_request belongs to that worker; else 403.
4. Accept `push_received`, `popup_shown`, `worker_seen` on the session path.
5. Return 401 for missing/invalid/expired auth (app treats 401/403 as "not confirmed").
6. Idempotent per (booking_request_id, event_type) — app may send the same event twice (token then login).
7. If the receiver uses a different session format, tell us — the app change is in two places only.

## 4. Older versions
SOURCE: older builds send only anon key (native) and have no fallback. **They cannot benefit without an app update**, except when they happen to be in the foreground: the web layer's `supabase.functions.invoke` already attaches the worker login automatically, so foreground confirmations from older builds may be accepted by the live receiver if (2) above is the contract — NOT VERIFIED. Background `push_received` from older builds: always refused.

## 5. Files
- `src/lib/bookingAck.ts` — `SESSION_FALLBACK_EVENTS`, `sessionFallbackAllowed()`, `jwtUsable()`, `ensureFreshSession()`, fallback in `ackBookingDelivery`.
- `android/.../BackendSync.kt` — `SESSION_FALLBACK_EVENTS`, `sessionFallbackAllowed()`, `sessionJwt()`, `postAck()`, login as primary auth when no token, one fallback in `sendAckHttp`, queue/send allowed with login when worker_id missing.
- `android/.../AckRetryWorker.kt`, `AckQueue.kt` — expired-token delivery events continue via login.
- `src/lib/__tests__/ackSessionFallback.test.ts` — 13 tests.

## 6. Tests
`bunx vitest run`: 12 files, 164/164 passed (13 new: missing token, expired login refresh, valid login, invalid login, logged out, refused token → one fallback, fallback refused → no loop, Accept/Reject never re-sent, duplicates, offline recovery, no tokens in logs).
Kotlin: NOT compiled, NOT run. Device / live receiver: NOT VERIFIED.
