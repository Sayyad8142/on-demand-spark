# Worker delivery fixes + ACK receiver readiness — 2026-10-22

Status labels: IMPLEMENTED / TESTED (offline) / NOT VERIFIED. Nothing published or deployed.

## 1. Worker App fixes (IMPLEMENTED, TESTED offline)

| Fix | Change | Test |
|---|---|---|
| No false "healthy" | `syncTokenToBackend` (`src/lib/pushToken.ts`) no longer writes `availability_state='ONLINE_HEALTHY'`, `notification_health='good'`, `no_ack_count=0`, `notification_repair_failures=0`, or clears fail history. Token fields only. | Covered by existing `alertsVerified` tests (permission/token never = verified) |
| Reconnect recovery | `src/lib/offerFreshness.ts` reconnect detector; `useBookingRequestsRealtime` fires a resync on SUBSCRIBED-after-disconnect; polling fallback re-fetches on resync and on browser `online`. Duplicates prevented by existing coordinator dedup (`shownBookingIds`, current alert) and single in-flight poll. | `offerFreshness.test.ts` |
| Expired offers never shown as new | Polling skips offers with past/near `timeout_at`, closed status, or server `recovered: true` (server gives timed-out offers a synthetic +60s timeout). Heartbeat path already filtered `timeout_at > now`. | `offerFreshness.test.ts` (5 tests) |

Checks: `bunx vitest run` 108/108 passed; TypeScript clean. Android compile: NOT RUN (no JDK/SDK in sandbox) — build on Mac per `docs/android-test-build-handoff-2026-10-22.md`.

## 2. Server-side expired acceptance (VERIFIED by reading live SQL; not changed)

`try_accept_booking` → `accept_booking_authoritative`:
- Refuses if booking assigned / not pending, not offered to this worker, worker unavailable/blocked/no payout.
- Expiry check refuses only when request status is NOT in (pending, sent, queued, accepted) AND its time is >90 s old.
- **Gap:** a request still `pending` with `timeout_at` in the past is accepted (the status bypasses the check), and closed offers get a 90 s grace. Recommend (Admin Panel, needs approval): refuse when `timeout_at < now()` regardless of status, with a small grace (≤5 s). Not changed here.
- `get-pending-worker-bookings` server "recovery window" (30 min) re-serves timed-out offers as pending; recommend removing or flagging only. App now ignores them.

## 3. Five-minute auto-OFF (HIGH PRIORITY, root cause identified)

- `worker-health-watchdog` (cron every 2 min) sets `is_available=false` when `last_seen_at` older than `HEARTBEAT_STALE_MIN = 5` minutes.
- App heartbeats: 45 s only while the Home screen is open and the app is in the foreground (`useEnhancedHeartbeat`); otherwise 30 min (`useWorkerHeartbeat`) plus FCM keepalive every 30 min. Android suspends JS timers in background.
- Result: any worker who locks the phone or switches apps is paused within ~5–7 min — exactly when she relies on push. Live: see query below.
- Recommended fix (Admin Panel, needs approval): raise stale threshold above the background interval (e.g. 45–60 min), or judge health by token/ACK failures instead of heartbeat age; never auto-pause on heartbeat age alone. App-side shorter background heartbeats are not reliable on Android and drain battery.

## 4. Admin Panel ACK receiver — deployment readiness: NOT READY

| Check | Result |
|---|---|
| Current deployed version/config | NOT VERIFIED — Admin Panel project not accessible from this workspace; known only that the deployed build is old (0 device events since 2026-10-14). |
| Compatibility with existing APK + signed tokens | PARTIAL — protocol matches staged source (`ack_token` body/`x-ack-token`, `v1.` HMAC format). Old APKs send no token → must keep session-auth path; not verified against staged code. |
| Staged tests pass | NOT VERIFIED (cannot run Admin Panel tests here). |
| Backup + rollback | NOT READY — need the live function source exported and redeploy-old procedure written. |
| No assignment/payment change | NOT VERIFIED against staged diff. |
| `ACK_TOKEN_SECRET` set in production | NOT VERIFIED. |

Next step: open the Admin Panel project (or share access) to run its tests, export the live function, and diff it. Wait for final approval before any deploy.

## 5. Real-phone tests: PENDING
