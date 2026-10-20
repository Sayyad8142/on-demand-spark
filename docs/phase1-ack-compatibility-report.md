# Phase 1 ACK compatibility — Worker App

Status: implemented in source, offline-tested. NOT built, NOT published, no backend deployed.

## 1. Existing correct integration (kept)
- FCM native receiver reads `ack_token` and sends `push_received` on actual arrival (`MyFirebaseService.java`), logs payload keys only.
- Token passed to overlay service and full-screen activity extras; `popup_shown`, `accept_tapped`, `reject_tapped`, `offer_expired` carry it.
- `AckQueue` stores token in app-private SharedPreferences; 24h age cap; token entries capped at 3 attempts.
- JS foreground FCM extracts and remembers the token; `buildAckBody` echoes it unchanged.
- Polling/realtime paths never emit `push_received` (only `popup_shown` when shown, `worker_seen` when viewed).
- Accept/Reject send ACKs fire-and-forget; their RPCs do not depend on ACK success.

## Confirmed gaps fixed
| Gap | Fix |
|---|---|
| `OfferQueue` dropped `ack_token`, so queued/restarted offers ACKed without it | Persist + restore `ack_token` in `offerFromIntent` / `applyExtras` |
| Native 401/403 without token was RETRY (retry loop) | 401/403 always terminal, never success |
| Native ACK queue and queued offers survived logout/account switch | `AuthBridge.clearToken` (called on logout) clears `AckQueue` and `OfferQueue` |
| JS token registry not cleared on logout | `signOut` calls `resetAckCache()` |
| JS Accept/Reject/`worker_seen` know only booking id, so token lookup missed | Registry also indexed by booking id |
| 200 skipped/request_not_found logged as "ok" | Logged as "skipped (not recorded)"; still terminal |

400 = terminal contract failure (unchanged). Network/5xx retry: token entries ≤3 attempts, all entries ≤24h.

Diagnostic probes (`BookingDiagnostics`, test pushes) have no offer token and rely on worker-session auth (NOT VERIFIED against new handler).

## 2. Files changed / tests
- `android/.../OfferQueue.kt`, `BackendSync.kt`, `AuthBridge.java`
- `src/lib/bookingAck.ts`, `src/contexts/AuthContext.tsx`, `src/lib/__tests__/ackToken.test.ts`
- Ran `bunx vitest run`: 6 files, 79/79 passed (mocked transport). Android code not compiled here.

## 3. Version
Source: `versionName "10.0.02"`, `versionCode 102` (build.gradle, `src/config/version.ts`). Whether this build is released: NOT VERIFIED. Next build needs a version bump.

## 4. Backend dependencies
- `ACK_TOKEN_SECRET` + send-FCM `ack_token` patch (Admin Panel, staged).
- New `ack-booking-delivery` handler (staged; old production handler will fail new contract).
- Session-auth path for token-less probes.

## 5. Device tests (pending)
For each: confirm `booking_offer_events` rows; no token in logcat/WorkerLog.
1. Foreground: app open → send offer → `push_received`, `popup_shown`, then Accept succeeds.
2. Background (home pressed): offer → overlay → `push_received` + `popup_shown`; Reject succeeds.
3. Swiped away (recents): offer arrives (FCM still delivered) → same events.
4. Force-stop (Settings → Force stop): FCM NOT delivered until app opened; expect no `push_received` — correct.
5. Process restart with queued offer: two offers, kill process during first, reopen → second offer ACKs carry token.
6. Offline: airplane mode during offer → reconnect → queued ACKs flush, max 3 tries for token entries.
7. Logout then login as another worker → no old ACKs sent.
8. Expired session + background offer → token ACK succeeds (needs new handler).

---

# Build readiness update (20 Oct 2026)

## Changes
- **Token expiry stops retries (client only):** `AckQueue.tokenExpiryMs` reads `exp` from the token to drop queued ACKs once expired (enqueue, prune, retry worker). The 24h cap no longer allows retries past expiry. Expired tokens are not restored from `OfferQueue`. Server verification stays authoritative; the offer's acceptance deadline still comes from `expires_at`, never the token.
- **Bounded retries for all ACKs:** caps count retry-worker attempts only and **exclude the initial request**. Token ACK: 1 initial + up to 3 retries (or expiry, whichever first). Session-only ACK: 1 initial + up to 5 retries, and at most 24h.
- **Booking-ID alias (JS):** exact `booking_request_id` lookup preferred; booking-ID alias points only to the newest offer; an unknown request ID never falls back to the alias; a request ID from another booking never resolves; `invalidateOffer` (reassignment/cleared) removes token and alias; expired tokens are not reused. Worker scoping comes from clearing on logout/account switch.
- **Logout/account switch:** `AuthBridge.clearToken` clears `AckQueue`, `OfferQueue`, cancels scheduled `AckRetryWorker` work and bumps a queue generation. In-flight callbacks capture the generation and cannot re-enqueue after cleanup. JS `resetAckCache` clears tokens, aliases, ack set and cached worker ID.

## Checks run
- `bunx vitest run`: 6 files, **85/85 passed** (adds tests for successive offers, delayed old-offer events, reassignment, expiry, account switch).
- TypeScript check (`tsgo -p tsconfig.app.json`): no errors.
- **Android compile: NOT RUN.** Blocker: the sandbox has no JDK, Android SDK or Gradle. Vitest does not verify Android code.

## Build command for your computer
```bash
git pull && npm install && npm run build && npx cap sync android
cd android && ./gradlew :app:compileDebugKotlin :app:compileDebugJavaWithJavac
./gradlew :app:assembleDebug   # internal test APK: app/build/outputs/apk/debug/
```
Needs JDK 21 and Android SDK 36.

## Version
Source is `10.0.02` / versionCode `102`. No internal build was prepared: the highest uploaded Play versionCode is not accessible here and must come from the owner.

## Remaining blockers
1. Android compile + device checklist (above).
2. Highest uploaded Play versionCode.
3. Backend: secret + send-FCM `ack_token`, new ACK handler (not deployed).
