# Worker Priority Score — read-only audit (15 Nov 2026)
Labels: LIVE-DB = read from production database today; SOURCE = app code; PRIOR = earlier audit; NOT VERIFIED = could not be checked.
Nothing was changed.

## A. Current system (LIVE-DB `recalc_worker_priority_score_one`)
Range 0–100 (clamped), stored in `workers.priority_score`, default 50 for new rows.
| Part | Points |
|---|---|
| Completed bookings, last 7 days | 5 each, max 40 |
| Online hours, last 7 days | 0.4/h, max 20 (column is 0 for all 43 active workers, so this part is dead) |
| Rating (admin override, else rating) | rating/5 × 25 |
| Seen in last 24h | +5 |
| Rating ≥ 4.5 | +10 |
| Heartbeat <3 min / <10 min | +8 / +3 (flag `priority_score_reachability_boost_enabled` = on) |
| Alert confirmed <30 min / <2 h | +5 / +2 |
| Acceptance ≥80% with ≥5 offers (7d) | +2 |
| Not reached (7d) | −5 each |
| Worker fault (7d) | −20 each |
| no_ack_count (lifetime counter, capped 10) | −2 each |
| Push deprioritised | −15 |
Recalculated every 15 min (cron `recalc-worker-priority-scores`), on completion, fault, reach event and reactivation. No daily/weekly reset; 7-day rolling windows.
LIVE today: min 4, median 25, avg 28.2, max 70; all recalculated 01:45 UTC.

Examples: A) 5.0 rating, 3 jobs, online now, alert confirmed: 15+25+5+10+8+5 = **68**. B) New worker, default 5.0, no jobs, online now: 25+5+10+8 = **48**. C) 4.2 rating, 2 jobs, 1 not-reached, no_ack 4, heartbeat 5 min: 10+21+5+3−5−8 = **26**.

## B. Where used (SOURCE)
- Profile `PriorityScoreCard` — shows stored score, but its "breakdown" (base 50, lifetime jobs, penalties 10/15/20/10, rating bonus) is invented in the app and does not match A.
- Home `HomePerformanceCard` (stored score) and `WorkerLeaderboardCard` (direct `workers` query; RLS returns only the worker's own row, so community list can show only self).
- Leaderboard `BookingLeaderboard` via `get-worker-leaderboard` (score→rating→jobs; returns `priority_score || 50`, so a real 0 shows as 50, `rating || 5` likewise).
- Next Booking: preview-only, reads `worker-next-booking`, which reports `ranking_mode: longest_waiting` — no score.
- Admin-only: `get_worker_score_debug`, `get_priority_shadow_comparison` (v3 shadow column), `get_worker_live_stats` (a third, different formula). None executable by workers (LIVE-DB grants checked).
- Android native: no score logic.

## C. Live dispatch impact: **NO / UNVERIFIED for tie-breaks**
- LIVE-DB `ops_settings dispatch.uniform_ranking = true` (equal ranking).
- LIVE-DB last 4 days: 30 bookings, 4–12 workers offered each; 23 of 30 had every offer created at the same instant (whole group at once), so order inside a group does not decide who sees it first.
- The repo copy of `booking-notifications` sorts by score then rating tiers — older than deployed (PRIOR); deployed selector source NOT VERIFIED.
- Score does not affect eligibility, favourite worker, acceptance window or Next Group/In Line.

## D. Issues
| # | Severity | Issue | Location |
|---|---|---|---|
|1|HIGH|Workers are told score decides bookings, but dispatch uses equal ranking|Profile/Home/Leaderboard copy|
|2|HIGH|Profile breakdown formula differs from real formula|`PriorityScoreCard.tsx:130-152`|
|3|MEDIUM|Online-hours part never filled (always 0) — 20 points unreachable|`workers.last_7_days_online_hours`|
|4|MEDIUM|`no_ack_count` is lifetime, not 7-day; delivery/phone problems punish workers|live formula|
|5|MEDIUM|Leaderboard shows 0 as 50 and missing rating as 5|`get-worker-leaderboard/index.ts:214-215`|
|6|MEDIUM|Three different formulas (live, v3 shadow, live_stats) + draft v4|DB functions, docs/priority-v4|
|7|LOW|Rating weighs twice (25 pts + 10 bonus); new workers default 5.0 get both|live formula|
|8|LOW|Heartbeat bonus changes within minutes; score jumps between screens|live formula, 15-min cron|
|9|LOW|Community card relies on reading other workers but RLS blocks it|`WorkerLeaderboardCard.tsx:46-52`|
No privacy leak found: workers can read only their own row; admin score RPCs are not executable by workers.

## E. Pros / cons
Pros: server-calculated, clamped, refreshed often, rewards completions and reliability, faults penalised, workers can't edit it (protected column guard).
Cons: misleading (no dispatch effect), short 7-day memory, rating counted twice, punishes network/phone issues, dead online-hours part, explanation mismatch.

## F. Improvements (not implemented)
HIGH: (1) Correct wording — say score is a performance score, booking order is "longest waiting first". Benefit: honesty; no dispatch effect. (2) Make Profile breakdown read the server `score_reason` parts. Benefit: matches real number; none to dispatch. (3) Fix leaderboard 0→50/5.0 fallbacks.
MEDIUM: (4) Choose one formula, retire others. (5) Remove or fill online hours. (6) Make no-ACK a 7-day window and exclude confirmed delivery failures. Downside: score shifts for some workers; no dispatch impact while equal ranking is on.
LOW: (7) Single rating term; new workers start neutral. (8) Smooth heartbeat bonus. Only matters if score ever drives dispatch again — then it would concentrate bookings on high scorers; test with shadow comparison first.

## G. Verdict: **PARTIALLY WORKING**
Calculation runs correctly and on schedule; display is partly wrong and workers are misled about its effect on bookings.

## H. Recommended fixes (exact, not applied)
1. `PriorityScoreCard.tsx`: replace local breakdown with parsed `score_reason` pts; change copy about booking priority.
2. `get-worker-leaderboard`: use `?? 50`/`?? null` instead of `||` (backend change — needs approval, auto-deploys).
3. Admin: decide fate of `last_7_days_online_hours` points and 7-day no-ACK window in `recalc_worker_priority_score_one`.
4. Obtain deployed `dispatch-pending-bookings` source to confirm same-group tie-break.
