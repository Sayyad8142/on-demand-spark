# Phase 1C — Secure Notification Acknowledgment (Worker App)

Status: implemented + offline-tested. NOT built, NOT published, NOT deployed. No production data touched.

## 1. Files changed
- JS: `src/lib/bookingAck.ts`, `src/lib/fcm.ts`, `src/services/bookingAlertCoordinator.ts`
- Android: `MyFirebaseService.java`, `BackendSync.kt`, `AckQueue.kt`, `AckRetryWorker.kt`, `BookingOverlayService.kt`, `BookingAlertActivity.kt`
- Tests: `src/lib/__tests__/ackToken.test.ts` (new)

## 2. Implementation
- Contract SOURCE: Admin Panel `docs/ack-fix/phase1b` (field `ack_token`, sent in ACK body, opaque `v1.<payload>.<hmac>`). Client never decodes, generates or edits it.
- FCM payload `ack_token` is read in foreground JS (`fcm.ts`) and native `MyFirebaseService`, passed via intent extras to overlay/activity, and stored in the durable ACK queue.
- Every ACK (push_received, popup_shown, worker_seen, accept/reject_tapped, offer_expired, popup_failed, overlay_blocked) carries the token when present; otherwise the existing session path is used.
- Token-bearing ACKs are sent even when local worker_id is unknown (expired session / cold start).
- Native HTTP outcome is now OK / RETRY / REJECTED. 400, and 401/403 on a token ACK, are REJECTED: logged as not acknowledged and dropped (previously 400 was silently treated as success). 401/403 without token, 408/429, 5xx and network errors retry.
- Token retries capped at 3 attempts (offer TTL + 15 min grace backend-side); queue retention unchanged.
- Payload logging now prints keys only; token never logged or sent to analytics.
- Accept/Reject RPCs, dispatch, assignment, payments untouched. ACK is telemetry only, so duplicate callbacks cannot assign anything; presentation events stay once-per-offer deduped.

## 3. Test results (offline, mocked)
`bun run test`: 77/77 passed (9 new): valid, missing, invalid/oversized token, remembered token reuse, duplicate, rejected (401) not success, network timeout, no token in console, 400/401/403 classification.
NOT VERIFIED offline: Kotlin/Java compile, real background/terminated delivery, expired-session ACK against real backend.

## 4. Backend requirements (Admin Panel)
1. Set `ACK_TOKEN_SECRET`; deploy send-FCM patch adding `ack_token` per worker.
2. Ship this APK.
3. Deploy Phase 1B ack handler (must keep accepting token-less session ACKs and `push_received`/`popup_shown` names).

## 5. APK build
`git pull` → `npm install` → `npm run build` → `npx cap sync android` → bump versionCode/versionName → signed release build (Capacitor 7, AGP/Gradle per project memory). Force update stays OFF.

## 6. Real-device checklist
- Foreground, background, swiped-away (terminated) push → `push_received` + `popup_shown` recorded with token.
- Expired session (clear session, keep app installed) → ACK still 200 via token.
- Airplane mode during push → retried on reconnect, ≤3 tries.
- Expired/tampered token → 401, logged REJECTED, not counted.
- Accept and Reject still work on overlay, full-screen activity and in-app card; double tap doesn't double-assign.
- `adb logcat` shows no token values.

## 7. Recommendation
App code: GO for internal test build. Rollout: NO-GO until native compile + device checklist pass and backend steps 1 and 3 are approved. Awaiting approval.
