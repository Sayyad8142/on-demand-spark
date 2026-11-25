# Priority Score V2 + Late Start status — Worker App integration

Date: 25 Nov 2026. Nothing published. No app version change. No dispatch, ranking-board order, alerts, acceptance, eligibility, earnings, payments or payouts changed. Late Start deductions stay off (Admin setting `enabled = false`).

## Live backend check (VERIFIED, hosted DB)

| Service | Status |
| --- | --- |
| `get_my_priority_score` | **NOT INSTALLED** on the hosted database. App reads it safely and falls back. |
| `get_my_late_start_status(p_booking_id, p_before)` | **INSTALLED**, session-scoped (worker from login), contract_version 1, callable by signed-in users. Settings: enabled=false, deadline 10 min, 5 points. 0 penalty history rows. |

## What the app now does

**Priority Score page (Profile → Performance score)**
- Calls `get_my_priority_score` when the page opens and when the worker taps Refresh. No polling, no retries, no worker id sent.
- Not installed / error / offline / unknown shape → existing score card exactly as before.
- `status: "inactive"` → existing live score, no V2 shown.
- `status: "preview"` → existing live score stays the big number; V2 breakdown shown under a "Preview — not your official score" label.
- `status: "active"` → server V2 score becomes the main number with its breakdown.
- Rows: Completed bookings, Customer ratings, Booking acceptance, On-time Start OTP — points/maximum and period copied from Admin. Neutral → "Not measured yet". No ratings → "New Worker".
- Active penalties with reason, points, end date and recovery text; penalties past their server end date are hidden.
- New-worker protection banner from the server.
- "Booking offers sooner" wording appears only when V2 is active **and** Admin sends `weighted_dispatch_active: true`; otherwise the existing "does not decide the order" line stays.
- Star row: workers with no customer ratings now see "New Worker" instead of the stored default rating as stars (22 of 45 active workers are unrated).

**Start Booking card**
- Home reads `get_my_late_start_status` for the pending-start booking (on open/refocus, no 15-second polling).
- Countdown uses the server `deadline_at`; if unavailable it uses acceptance + 10 min exactly as before.
- Late-start warning only if server `enabled` and booking `penalty_enabled` and not exempted; "−N points" only when server history records an unreversed deduction. Nothing is calculated locally.
- 10/15/20-minute alarms unchanged.

## Expected `get_my_priority_score` response (contract the app accepts)

```json
{
  "contract_version": 1,
  "status": "inactive | preview | active",
  "live_score": 61.35, "v2_score": 72, "max_score": 100,
  "weighted_dispatch_active": false,
  "server_now": "ISO", "updated_at": "ISO",
  "components": [
    { "key": "completed_bookings | customer_ratings | booking_acceptance | start_otp_on_time",
      "points": 28, "max_points": 35, "state": "measured | neutral | new_worker",
      "period_days": 30, "detail": "optional text" }
  ],
  "penalties": [{ "id": "…", "reason": "…", "points": 6, "created_at": "ISO", "expires_at": "ISO", "recovery": "optional text" }],
  "new_worker_protection": { "active": true, "ends_at": "ISO", "detail": "optional text" }
}
```
Any other shape is ignored (existing card shown). Unknown component keys are skipped, not invented.

## Remaining Admin dependencies

1. **Deploy `get_my_priority_score`** (session-scoped, no worker id parameter) matching the shape above, or send the real contract so the reader can be matched to it.
2. **Scheduled-booking deadline.** The live `get_my_late_start_status` computes `deadline_at = accepted_at + deadline_minutes` for every booking, including scheduled ones. The requested rule (later of acceptance or scheduled start, + deadline) must be added on the server; the card will follow automatically.
3. **Android alarms after (2).** The phone's 10/15/20-minute alarms read `accepted_at` directly. Today that matches the server deadline exactly. Once Admin changes scheduled deadlines, the native alarm needs to read the same server countdown start, which needs a new Android build — not done here (no version change allowed).
4. Late Start deductions stay off until Admin enables them.

## Tests

- `bun run test`: 94 files, **1000 tests passed**.
- New: `priorityScoreV2.test.ts` (9: unavailable, inactive, preview, active, server order/no summing, Not measured yet / New Worker, active vs expired penalties, protection, weighted-dispatch wording) and `lateStartStatus.test.ts` (7: disabled deductions, instant deadline = alarm anchor, scheduled server deadline, overdue from server deadline, penalty only from server history incl. reversal, exempted, unavailable/malformed/other booking fallback).
- Offline: the score reader swallows network failure and returns nothing → existing card (covered by the unavailable test path; browser offline not separately exercised).

## Not verified

- Signed-in worker view of the real page (worker login cannot be created from this environment).
- Real V2 responses (service not installed).
- Android device alarms.
