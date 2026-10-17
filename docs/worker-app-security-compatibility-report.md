# Phase 6A — Worker App Security Compatibility Report

Labels: SOURCE = read from current code; NOT VERIFIED = not tested on a device or database.
Nothing was published, deployed, or changed in live data.

## 1. Authentication architecture (SOURCE)
- Login: phone OTP; the app holds a Supabase session (`access_token` + `refresh_token`).
- JS storage: Supabase client with `capacitorStorage`, `persistSession`, `autoRefreshToken` (`src/integrations/supabase/client.ts`).
- Native copy: `AuthContext.saveSession` writes `didi_session` {accessToken, refreshToken, expiresAt} to `CapacitorStorage` prefs; `AuthBridge.saveToken` writes `supabase_jwt` to `worker_prefs`.
- Identity mapping: server-side `auth.uid()` → `workers WHERE user_id::text = uid OR id = uid` (in `try_accept_booking`, migration `20260429114615`).

## 2. Accept / reject entry points
| Path | File | Call | Auth header | Worker id in body |
|---|---|---|---|---|
| Booking card | `src/components/BookingCard.tsx:35` | `tryAccept` → `rpc try_accept_booking` | user JWT (Supabase client) | No |
| Native accept broadcast | `src/App.tsx:421` | `tryAccept` | user JWT | No |
| Realtime hook | `src/hooks/useBookingAlerts.ts:61,74` | `tryAccept` / `rejectBooking` | user JWT | No (arg ignored) |
| Overlay service (background/notification) | `BookingOverlayService.kt:1053,1186` | REST `try_accept_booking`, `reject_booking_offer` | `Bearer <user JWT>` after refresh | No |
| Full-screen alert (notification tap / reopened) | `BookingAlertActivity.kt:709,642` | same | `Bearer <user JWT>` after refresh | No |

Headers on all accept/reject calls: `apikey: <public key, redacted>`, `Authorization: Bearer <user access token, redacted>`, body `{"p_booking_id": "<id>"}`.
No accept/reject path uses the public key alone. Anon-key-only calls exist, but only for telemetry/heartbeat (`BackendSync.kt` boot-ping, ack, missed-booking, heartbeat; `KeepaliveAckWorker.kt`; overlay/alert ACK at `BookingOverlayService.kt:833`, `BookingAlertActivity.kt:401`). They are out of scope for assignment but are separately unauthenticated.

## 3. Session expiry and refresh
- JS: `ensureValidSession` refreshes if <2 min left; no session → request not sent; reject retries once after JWT error.
- Native: refresh via `/auth/v1/token?grant_type=refresh_token` before every accept/reject; no token → "please log in", no request.
- Reopened after hours: works if the refresh token is still valid; otherwise worker must log in (safe failure).

### Risks found (not blocking the patch)
1. **Throttled refresh** (`BookingOverlayService.kt:908-920`): within 30s of a refresh it returns the stored token without checking expiry. Low risk (token was just refreshed); worst case a clean 401, never a wrong identity.
2. **Refresh-token rotation race**: native and JS both refresh with the same refresh token. If both rotate, one may get `invalid refresh token` → worker logged out. Availability risk, not a security risk. NOT VERIFIED on device.
3. **No retry on 401 in native accept**: an expired token gives an error toast; the worker taps again. Safe.

## 4. Compatibility with the proposed backend patch
| Requirement | Status |
|---|---|
| Authenticated session | Met on every accept/reject path |
| Verified identity | Met — server uses `auth.uid()`, client sends no worker id |
| Offer belongs to worker | Server check; client already passes only booking id |
| Valid, unexpired offer | Server check; clients show failure on refusal |
| Assignable booking | Server check |
Required patch constraint: keep the RPC names and the `p_booking_id` argument unchanged — every client depends on them.

## 5. Version findings
| Version | Finding |
|---|---|
| 10.0.02 (current source) | COMPATIBLE (SOURCE) |
| 10.0.01 | UNVERIFIED — no source snapshot or APK reviewed |
| 7.0.4 | UNVERIFIED |
| 7.0.0 | UNVERIFIED |
| 6.0.64 | UNVERIFIED |
Older builds must be checked from their APKs (decompile and look for the RPC name, arguments and `Authorization` header) or kept off by the force-update screen before the patch ships.

## 6. Required Worker App changes
None required for compatibility. Optional hardening (not applied): check expiry in the throttled refresh path; single-owner token refresh between native and JS.

## 7. Offline tests (`src/lib/__tests__/bookingActionsAuth.test.ts`, mocked backend)
9/9 pass; full suite 68/68 (`bun run test`).
1 own offer, only booking id sent ✓ · 2 another's offer refused ✓ · 3 no session → no request ✓ · 4 expired session blocks; JWT-expired reject retries once ✓ · 5 refresh before accept ✓ · 6 expired offer = gone, not rejected ✓ · 9 duplicate accept respected ✓ · 10 network error never success ✓.
7 (notification accept) and 8 (reopen after hours) on native: SOURCE review only — Kotlin code is not runnable here. NOT VERIFIED.

## 8. Remaining integration tests (need an isolated test project + real devices)
Patched RPC against two test workers; offer stealing; expired offer; background/notification/killed-app accept; reopen after 8h+; native/JS refresh race; airplane-mode retry; every UNVERIFIED version.

## 9. Files changed
- `src/lib/__tests__/bookingActionsAuth.test.ts` (new test)
- `docs/worker-app-security-compatibility-report.md` (this report)

## 10. Deployment dependencies
Isolated test project; patch keeps RPC signatures; decision on old versions (force update or APK check); backend patch deployed only after explicit approval.

## Conclusion
**COMPATIBLE** — the current Worker App (10.0.02 source) can use the secure backend. Older versions are UNVERIFIED and must be checked or blocked by force update before the patch goes live.
