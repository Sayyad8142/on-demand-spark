# Option A — Supabase-session confirmation fallback (Worker App build 102) — NOT deployed
Date 2026-10-22 · Labels: SOURCE / TESTED / NOT VERIFIED

## Pre-check: does build 102 have a Supabase worker session? YES (SOURCE)
- Workers sign in through Supabase Auth (`supabase.auth.verifyOtp` / `signInWithOtp` / `signInWithPassword` in `src/pages/OtpVerify.tsx`, `src/pages/Auth.tsx`).
- supabase-js: `persistSession: true`, `autoRefreshToken: true`, storage key `didi-worker-session` in Capacitor Preferences (`src/integrations/supabase/client.ts`).
- AuthContext mirrors `accessToken` to `didi_session` on SIGNED_IN / TOKEN_REFRESHED (`src/contexts/AuthContext.tsx`). Both are cleared on logout.
- No Firebase ID token is used for confirmations. No new login mechanism was invented.

## Request contract the app sends
| Path | Authorization header | Body |
|---|---|---|
| Preferred (token) | `Bearer <anon key>` (native) / current session (web) | `ack_token`, `booking_id`, `booking_request_id`, `event_type`, app info, optional `worker_id` (informational only) |
| No token | `Bearer <Supabase worker access_token>` | same, no `ack_token` |
| Fallback after token 401/403 (once) | `Bearer <Supabase worker access_token>` | **no `ack_token`, no `worker_id`** |
`apikey: <anon key>` always. `ack_token` never in headers.

## Event names
Canonical: `push_received`, `popup_shown`, `worker_seen`. Alias `booking_seen` → `worker_seen` (deduped together). Legacy 400 retry (`received`/`opened`) unchanged. Accept/Reject: unchanged, never use the fallback.

## Session refresh
- Web: before a token-less or fallback send, session is checked; if it expires within 30 s it is refreshed via `supabase.auth.refreshSession()`. Refresh failure → no request.
- Native background: cannot refresh; uses the freshest unexpired token of `didi_session` / `didi-worker-session` (≥30 s left). None → stays in the existing queue (24 h, 100 entries, attempt caps 1+3 token / 1+5 session) and is flushed on open / resume / heartbeat / boot after the app refreshes the login. Never sent unauthenticated as success.

## Receiver requirements
1. Valid `ack_token` → use its claims.
2. Else verify `Authorization` as a Supabase JWT → worker via `workers.user_id = sub OR workers.id = sub`. Ignore body `worker_id`.
3. Booking request must belong to that worker → else 403.
4. Accept `push_received`, `popup_shown`, `worker_seen` (and `booking_seen` alias if desired) on the session path.
5. 401/403 for bad auth; idempotent per (booking_request_id, event_type).
6. Inspected source ≠ deployed build → live compatibility NOT VERIFIED. Test with one real worker login after deployment of the matching receiver.

## Files
`src/lib/bookingAck.ts` (canonicalAckEvent, sessionFallbackAllowed, jwtUsable, ensureFreshSession, fallback) · `android/.../BackendSync.kt` (canonicalAckEvent, sessionJwt reads both stores, postAck, one fallback) · `AckRetryWorker.kt`, `AckQueue.kt` (expired-token delivery events continue via session) · `src/lib/__tests__/ackSessionFallback.test.ts` (15 tests).

## Tests
`bunx vitest run`: 12 files, **166/166 passed**. Kotlin NOT compiled; no device or live receiver test.

## Older versions
No benefit in background without an update. Foreground web-layer confirmations from older builds already carry the Supabase session and may pass if the receiver implements (2) — NOT VERIFIED.
