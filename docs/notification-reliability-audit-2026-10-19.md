# Worker App Notification Reliability Audit (19 Oct 2026)

Status: READ-ONLY audit. No code, database, edge function, RLS, trigger or settings changes. Nothing deployed or published.
Prepared per the Notification Reliability Audit brief (task9289.txt). STOP — awaiting explicit approval before any fix.

Labels: **SOURCE** (read from this repo's code) · **LIVE-VERIFIED** (production logs/DB, read-only) · **PRIOR** (prior audit report) · **NOT VERIFIED** (needs a device / other project / live check).

---

## Headline

**Zero device ACKs since 15 Oct are caused by a backend regression (Category D): the deployed `ack-booking-delivery` function is an OLD build that only accepts `received`/`opened`, while every phone sends `push_received`/`popup_shown` → HTTP 400 → the native ACK client silently drops the ACK as a terminal error.**

The corrected build already exists, is staged with a worker_id validation fix, has 24 passing offline tests, and waits for deploy approval (docs/ack-recovery/). A separate, fully diagnosed backend bug (`_reject_booking_request_core` malformed array literal) makes Reject fail and re-offer the same booking — see docs/reject-fix/.

---

## 1. Notification pipeline (SOURCE, unless labeled)

### 1a. FCM token registration / refresh — VERIFIED HEALTHY BY DESIGN
- `useFCMTokenSync(userId)` (src/hooks/useFCMTokenSync.ts) is the single token lifecycle manager:
  - Evaluates backend freshness: `workers.fcm_token`, `fcm_token_status`, `fcm_token_platform`, `fcm_token_updated_at` (7-day staleness threshold).
  - Triggers refresh on: mount (500 ms), every 30 min self-heal, app resume, network reconnect, `invalid`/missing/null platform token.
  - Writes back via `syncTokenToBackend` → `workers.fcm_token` + health fields (token health tracking per project memory).
- `src/native/push.ts` registration listener only logs (no duplicate writes — dedup fix documented in the file header).
- Boot path: `BootReceiver` → `FcmBootSyncWorker` → `worker-boot-ping` edge function (SOURCE; live behavior NOT VERIFIED without device).
- `useAutoPushRepair` triggers `pushRepairCoordinator` on login/resume/network/native app-resume (SOURCE).
- Token health fields (status/platform/send/fail) are the admin-visible source of truth (project memory; Admin Panel NOT VERIFIED).

### 1b. Permission handling — VERIFIED BY DESIGN, device NOT VERIFIED
- `src/native/push.ts`: `checkPermissions` → `requestPermissions` if needed; on `denied` the app warns ("Booking alerts are disabled") and exits.
- `src/lib/permissions.ts` handles POST_NOTIFICATIONS (Android 13+) and the overlay permission chain (`OverlayPlugin` with per-package settings fallback).
- OEM-specific behavior (MIUI, ColorOS etc.) via `src/lib/oemHints.ts` — device NOT VERIFIED.

### 1c. Foreground push (app open, webview alive) — SOURCE
- Capacitor listener in `src/lib/fcm.ts` (and bundled `fcm-DfIeUssH.js`): `pushNotificationReceived` →
  - `BOOKING_REASSIGNED` → `handleBookingReassigned`; informational (`actionable=false`) → ignored (logged);
  - actionable → **ACK `push_received`** + `trackFcmOffer` (20 s timeout report) + `processIncomingBooking` via `BookingAlertCoordinator` (dedup).
- Native side receives the same data-only FCM (`MyFirebaseService.java`) in parallel — two ACK sources for one push (server dedupes; see §6, MEDIUM-2).

### 1d. Background / terminated push — SOURCE
- Data-only FCM → `MyFirebaseService.onMessageReceived` (runs for data messages in background/terminated):
  1. Validates `booking_id`; parses price/schedule/prealert.
  2. **ACK `push_received`** (fire-and-forget background thread) + schedules `AckWatchdogWorker`.
  3. `actionable=false` → tray only. Otherwise: builds canonical offer intent (`expires_at`, `sent_at`, `ttl_seconds`, `booking_request_id`).
  4. `OfferQueue.isTaken` (assigned elsewhere) → cancel notification, no popup.
  5. FIFO `OfferQueue.enqueue` (dedup; duplicate → tray only). Locally busy → offer not queued.
  6. Overlay permission present → `BookingOverlayService` (mode=show); missing → `BookingAlertActivity` fallback; tray notification always shown.
- Tap: `pushNotificationActionPerformed` / tray notification → same routing.

### 1e. Popup rendering (BookingOverlayService / BookingAlertActivity) — SOURCE, device NOT VERIFIED
- Countdown resolved from payload `expires_at`/`ttl_seconds` (default 60 s); on expiry → `finishAndStop("countdown_expired")` + **ACK `offer_expired`**.
- **ACK `popup_shown`** only after the overlay view is actually added to the window.
- Session missing → **ACK failure event `session_missing`** (four call sites).
- Accept/reject: token from Intent or SharedPreferences; `try_accept_booking` (BookingOverlayService line 1053) and `reject_booking_offer` (line 1186) with worker JWT (matches Phase 6A finding: every accept/reject path authenticates; no worker id trusted from the client).
- `booking_offer_open` (line 825) for status polling.
- Reject-failure UX: on non-confirmed reject the popup currently closes after two toasts ("Couldn't reject. Please try again." → "Reject failed") — documented in docs/reject-fix/P0_REJECT_AND_ACK_REPORT.md §6C; improvement drafted (keep open + Retry), NOT implemented.

### 1f. Accept / reject — PRIOR (docs/worker-app-security-compatibility-report.md): COMPATIBLE for 10.0.02
- JS paths refresh session < 2 min before expiry; native refreshes before every action; no session → no request.
- Live reject RPC is currently broken server-side (see §6, CRITICAL-2) — that failure is independent of the notification pipeline.

### 1g. ACK durability (native) — SOURCE
- `BackendSync.ackDeliveryAsync`: persists to `AckQueue` first (durable), then sends `sendAckDirect`; on success + `popup_shown`/`worker_seen` → `AckWatchdogWorker.cancel`.
- Network/5xx → queued + `AckRetryWorker` (WorkManager, exponential backoff 30 s → cap 10 m; flushed onResume, boot, heartbeat).
- Missing worker_id → queued with reason `no_worker_id`, flushed on next login/resume/boot.
- **Terminal 4xx (except 401/403) is treated as DONE and dropped** (BackendSync.sendAckHttp, "Terminal http — dropping") — this is the silent-loss behavior that hides today's 400s (§6).

### 1h. ACK durability (JS) — SOURCE (src/lib/bookingAck.ts)
- In-memory dedup per (booking_request_id ?? booking_id, event); failure clears the key so it retries next time.
- worker_id best-effort (localStorage cache + workers lookup); edge function falls back to JWT resolution.
- Events: push_received, popup_shown, worker_seen + accept_tapped, reject_tapped, offer_expired, offer_dismissed (logged only, never change dispatch).

---

## 2. ACK call sites — every one (SOURCE)

| # | Site | Event | IDs sent | Correct? |
|---|------|-------|----------|----------|
| 1 | `MyFirebaseService.java:220` | push_received | booking_id, booking_request_id, worker_id (prefs), app_version, native_version_code, device_info | Yes |
| 2 | `BookingOverlayService.kt:695` | popup_shown | booking_id, booking_request_id | Yes (only after overlay added) |
| 3 | `BookingOverlayService.kt:491` | offer_expired | booking_id, booking_request_id | Yes |
| 4 | `BookingOverlayService.kt:264/281/294/311` | session_missing (failure) | booking_id, booking_request_id | Yes |
| 5 | `BookingOverlayService.kt:524 / 627` | accept_tapped / reject_tapped | booking_id, booking_request_id | Yes (log-only) |
| 6 | `BookingAlertActivity.kt:304` | popup_shown (onResume) | ackBookingId, ackRequestId | Yes |
| 7 | `BookingAlertActivity.kt:214/263/283` | offer_expired / accept_tapped / reject_tapped | booking_id, request id | Yes |
| 8 | `src/lib/fcm.ts:66` | push_received (webview foreground) | booking_id, booking_request_id | Yes |
| 9 | `bookingAlertCoordinator.ts:323/340` | worker_seen / popup_shown (webview card) | booking_id, booking_request_id | Yes |
| 10 | `bookingActions.ts:69-70/110-111` | worker_seen + accept/reject_tapped | booking_id | Yes (log-only) |
| 11 | `fcmAckTracker.ts` (timeout, 20 s) | fcm_ack_timeout → report-missed-booking | workerId, userId, bookingId, bookingRequestId | Yes |

- URL: `$SUPABASE_URL/functions/v1/ack-booking-delivery`, `apikey` + `Authorization: Bearer <ANON_KEY>` — correct and matches the function's anon-key design (verify_jwt=false). SOURCE.
- No call site blocks the booking lifecycle: all ACKs are fire-and-forget. SOURCE.
- Errors are swallowed (warn + drop) — see §6 HIGH-1.
- **No site sends a wrong booking/worker id was found.** The 10.0.02 regression suspicion is NOT the client: client protocol unchanged; the backend stopped accepting it (§3, §6).

---

## 3. Current vs last-working version — LIVE-VERIFIED

- `booking_offer_events`, last 7 days (LIVE-VERIFIED, queried today 13:15 UTC):

| Event | Source | Count | First | Last |
|---|---|---|---|---|
| push_sent | server | 510 | 13 Oct 01:37 | **19 Oct 11:17** |
| server_lost | server | 215 | 13 Oct | 19 Oct 09:50 |
| push_received | device | 163 | 13 Oct 01:37 | **14 Oct 13:17:10** |
| server_not_delivered | server | 146 | 13 Oct | 19 Oct 11:19 |
| popup_shown | device | 144 | 13 Oct | **14 Oct 13:17:10** |
| server_unreachable | server | 92 | 15 Oct 07:52 | 19 Oct 10:54 |
| server_accepted / server_rejected | server | 72 / 43 | 13 Oct | 19 Oct |
| worker_seen | device | 21 | 13 Oct 01:50 | **14 Oct 09:10** |
| session_missing | device | 15 | 13 Oct | 14 Oct |
| server_expired | server | 13 | 13 Oct | 19 Oct |
| accept_tapped / reject_tapped | device | **0** | — | — |

- **Every device-sourced event stops at 14 Oct 13:17 UTC; server-side push activity continues to today.** Nothing changed on phones at that moment that would stop ACKs across 3 devices/models simultaneously — the backend did.
- This morning (07:52 UTC): 37 `ack-booking-delivery` calls in 24 h, **all HTTP 400** (LIVE-VERIFIED earlier; edge log retention dropped them by 07:59 — only 3 remained; at 13:12 UTC, zero ack logs retrievable in 72 h; only 2 unrelated `create-worker-payout` 503s remain).
- Repo source `supabase/functions/ack-booking-delivery/index.ts` is the CORRECTED build (accepts `push_received`/`popup_shown`/`worker_seen` + legacy aliases `received`/`opened`/etc.). SOURCE. Therefore the deployed copy ≠ repo — an old build was deployed/reverted between **14 Oct 13:17 UTC** (last recorded device event) and **15 Oct 05:35 UTC** (first unacked offer). Which build, when and how — NOT VERIFIED (deployment history lives in the Supabase dashboard / Admin Panel project).
- Deployed function name/UUID mapping for edge log filtering changed this week (name filter returns nothing; earlier session matched on UUID `6c19f40e-...`). Observability note, not a defect.

---

## 4. Popup behavior — SOURCE (device NOT VERIFIED)

- Correct booking info shown: customer, community, service, flat_no, price, scheduled time — all parsed and passed through the canonical intent. Payload keys include flat_no and price (matches FCM payload memory).
- Foreground vs background: covered both (webview listener + native service); dedup via `BookingAlertCoordinator` (JS) and `OfferQueue` (native, persisted FIFO).
- Server countdown: native uses authoritative `expires_at`/`ttl_seconds`; expiry closes popup and ACKs `offer_expired`; expired offers cannot be accepted (countdown stops UI; server is authoritative anyway).
- No duplicate popups: `OfferQueue.enqueue` returns already-queued → tray only; `isTaken` → skip entirely.
- No duplicate assignment on accept: server-side `try_accept_booking` is authoritative; `isTaken` is a client-side shortcut.
- Popup-over-other-apps depends on overlay permission — OEM-dependent, NOT VERIFIED per device/OEM; fallback = full-screen `BookingAlertActivity` + tray notification (matches overlay-alert-fallback memory).
- Known UX gap: after a FAILED reject (server bug), popup closes with two toasts instead of staying open with Retry (docs/reject-fix §6C).

---

## 5. Android vs iOS

- **Android only.** No `android/ios/` directory; Capacitor Android-only build. iOS is out of scope for this app.
- Android findings above hold. Items that CANNOT be verified without a physical device:
  - Actual popup rendering per OEM/Android version; overlay-permission prompts and their OEM quirks.
  - FCM high-priority delivery rates per OEM battery saver (server_unreachable/server_lost 215+146 events suggest some delivery loss, cause NOT VERIFIED from here).
  - Boot-time token sync (`FcmBootSyncWorker` → `worker-boot-ping`) end-to-end.
  - Older APK versions' ACK event names (docs/reject-fix §5: NOT VERIFIED from APKs).

---

## 6. Root-cause classification (A–F) and issue list

### Category verdict: **D — ACK sent but the backend rejects it** (HIGH confidence)

Evidence:
1. Devices DID send ACKs and they WERE recorded until 14 Oct 13:17 UTC (LIVE-VERIFIED) → A (never reaches phone) and B (listener fails) are excluded for the window since 15 Oct — the same client builds recorded device events the day before.
2. All 37 ACK HTTP calls observed this morning were 400 (LIVE-VERIFIED earlier) → the ACK was sent (C, D both candidates), backend answered rejection (D).
3. Native `sendAckHttp` logs `terminal http=400 — dropping` and returns true → ACK also silently dropped client-side (compounding behavior, HIGH-1 below). SOURCE.
4. Repo source is the corrected build; the live copy rejects new event names (PRIOR: push-ack analysis; docs/reject-fix §4; docs/ack-recovery). → deployed copy is the old build.
- **F (multiple) not applicable**; **E (backend tracking fails)** not applicable (tracking upserts work — 163/144/21 device events prove the write path when the build accepts the event names).

### Issues

**CRITICAL-1 (Category D) — Live `ack-booking-delivery` is an old build; every `push_received`/`popup_shown` returns 400.**
Impact: since 15 Oct, zero device ACKs; `no_device_ack`/"unreachable" labels on offers are NOT proof workers didn't see them; lower notification_health and missed-alert counts for affected workers; watchdogs fire on false timeouts.
Fix: deploy the staged corrected build (`docs/ack-recovery/staged/` index.ts + handler.ts, includes SAFE_WORKER_ID validation) — already prepared, 24 offline tests pass, deploy/verify/rollback procedure in docs/ack-recovery/DEPLOY_AND_ROLLBACK.md. BLOCKED on owner approval.

**CRITICAL-2 (separate backend bug, interacts with notifications) — `_reject_booking_request_core` "malformed array literal".**
Impact: Reject rolls back → offer stays pending → re-offer sweep re-sends to the same worker; workers see "Reject failed"; admins see the same booking looping. Fix drafted (`docs/reject-fix/001_reject_core_array_fix_DRAFT.sql`, 19/19 offline tests). BLOCKED on owner approval.

**HIGH-1 — Native ACK client treats the 400 as terminal and drops it silently.** SOURCE (BackendSync.sendAckHttp: `if (!ok && code in 400..499 && code != 401/403) return true`).
Impact: hides backend regressions exactly like today's; no retry, no backend signal. Proposed (next release, not now): when the backend rejects an event name (400 with a "must be received or opened"-style body), retry later or report via `report-missed-booking`; at minimum mirror the drop into `fcmAckTracker`-style telemetry. Do NOT retry on auth errors.

**HIGH-2 — No automated alert for "device ACKs = 0 while push_sent > 0".** The outage ran 5 days unnoticed. Mitigation already prepared: 15-minute monitoring SQL in docs/ack-recovery/DEPLOY_AND_ROLLBACK.md (alert when sent ≥ 5 and device_acks = 0).

**MEDIUM-1 — Re-offer loop while both bugs live:** reject fails → offer stays pending → sweep re-sends → duplicate pushes. Also inflates `server_unreachable`/`server_lost` counts. Fixed by CRITICAL-2.

**MEDIUM-2 — Dual ACK sources (native service + webview listeners) in foreground.** Benign today: server upserts are idempotent (unique per booking_request_id + event_type); JS and native dedup independently. Keep as-is; do not add cross-process dedup (risk > benefit).

**MEDIUM-3 — JS `fcmAckTracker` 20 s timeout only works while the webview runs.** Native `AckWatchdogWorker` covers the terminated case — by design, no change.

**LOW-1 — Edge-log retention too short to audit ACKs after the fact** (37 rows gone within hours). The monitoring SQL on `booking_offer_events` covers this durably.

**NOT VERIFIED / UNTESTED (honest limits):**
- No device test of the corrected function (needs deploy approval + a phone).
- Which exact build is live, and the deploy/revert timestamp (dashboard history).
- Older APK ACK event names.
- `create-worker-payout` 503 seen today (2 calls, 13:10 UTC) — out of scope of this audit but recorded for follow-up.

---

## 7. Safe fix plan

### Fix 1 (primary, backend-only, no app release needed): deploy the staged corrected `ack-booking-delivery`
- Root cause: Category D regression at ~14 Oct 13:17 UTC. Confidence: HIGH.
- Files: `docs/ack-recovery/staged/index.ts` + `docs/ack-recovery/staged/handler.ts` → `supabase/functions/ack-booking-delivery/`. Keep `verify_jwt=false` (phones use the anon key).
- Already includes: both event-name sets, worker_id validation (injection fix), idempotent timestamps, health recovery on push_received. Does NOT touch accept/reject, assignment, OTP, payments, payouts.
- Tests: 24 offline tests pass (contract/authorization/idempotency). Full suite evidence in docs/ack-recovery/.
- Deploy steps, post-deploy probes (403 on unknown worker → corrected build live; `400 "must be received or opened"` → old build still live; injection probe), verification SQL and rollback (restore owner-held single-file backup) are in docs/ack-recovery/DEPLOY_AND_ROLLBACK.md.
- Regression risk: LOW. Rollback: seconds.

### Fix 2 (backend-only, separate approval): reject core array fix — docs/reject-fix/
- One-statement change; restores Reject on all app versions; rollback = `000_reject_core_LIVE_BACKUP.sql`.

### Fix 3 (next app release, optional): stop silently dropping terminal 4xx ACKs (HIGH-1) + popup stays open with Retry on failed reject (§4).

### Post-deploy recovery (needs approval)
- Mark 15–17 Oct `no_device_ack` offers as "ack outage" for the 14 identified workers; recompute notification_health once; no auto resets.

### Monitoring
- 15-min SQL: device_acks = 0 while push_sent ≥ 5 → alert (docs/ack-recovery/DEPLOY_AND_ROLLBACK.md). Add same watch for server_unreachable spikes (MEDIUM-1).

### Real-device verification plan (after deploy)
1. Trigger one test booking to a test device → confirm `push_received` + `popup_shown` rows appear in `booking_offer_events` within 60 s.
2. Confirm a real reject returns 200 after Fix 2 and the offer moves to the next tier.
3. Confirm Admin Panel shows device ACKs again and `no_device_ack` labels stop accumulating.

### Deployment checklist
1. Owner: confirm backup of live function + settings (DONE per owner).
2. Explicit approval to deploy (pending).
3. Deploy staged build; run probes; verify first live ACK lands.
4. Enable monitoring SQL.
5. Schedule outage marking (approval pending).
6. Schedule Fix 2 (approval pending) and the next-release client hardening (Fix 3).

---

## Bottom line

The Worker App's notification pipeline is behaving as designed: pushes are sent, phones receive them, popups render, and ACKs are dispatched. The pipeline's telemetry has been blind since 15 Oct because the backend function that records device ACKs was replaced by an old build that rejects the phones' event names with 400 — and the native client, following its documented policy, drops those failures silently. Deploying the already-tested corrected function restores the telemetry with no app release; the separate reject bug fix restores normal offer progression.
