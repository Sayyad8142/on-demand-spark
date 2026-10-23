# Priority Score — live audit (read-only, 2026-10-24 IST)

Nothing was changed. Sources: live `recalc_worker_priority_score_one`, `cron.job`, repo `booking-notifications`, live worker/booking/fault data.

## 1. Live formula (VERIFIED, runs every 15 min + on booking/fault/reach triggers)
Plus (last 7 days): completed ×5 (max 40); online hours ×0.4 (max 20); rating/5×25; seen in 24h +5; rating ≥4.5 +10;
heartbeat <3 min +8 / <10 min +3; alert confirmed <30 min +5 / <2 h +2; acceptance ≥80% of ≥5 offers +2.
Minus (last 7 days): every `worker_fault_events` row −20 (any reason, incl. `worker_refused`); each `not_reached` −5;
`no_ack_count` ×2 (max 20); push deprioritised −15. Clamped 0–100. New worker: column default 50, rating default 4.0 → ≈25 after first run.

## 2. Where it is used for dispatch (repo source; deployed dispatcher NOT VERIFIED to match)
`booking-notifications`: workers split by rating — T1 ≥4.5, T2 4.0–4.49, T3 <4.0. Score only orders workers inside a group.
T2 is pushed only if T1 is empty (`notify-next-tier` escalates later). Leaderboard also sorts by score and shows 50 when score is 0.

## 3. Profile card vs server (SOURCE: PriorityScoreCard.tsx)
Card base 50 (server has no base); +1/job lifetime (server +5/job, 7 days); penalties 10/15/20/10 (server flat 20 per fault);
card ignores online hours, rating points, 4.5 bonus, reach, no-ack, recency; bonus +5 at 4.8/5 ratings (server +10 at 4.5). Only the big number comes from the server.

## 4. Unfair penalties (VERIFIED in live data)
- `not_reached`: 136 events in 30 days, −5 each — mostly phone/delivery problems.
- `no_ack_count`: 5 workers penalised; confirmations were broken 8 days (receiver bug), so these are mostly not the worker's fault.
- `worker_refused` counted −20 (Kaveri vadde ×2).
- Heartbeat/confirmation boosts reward phones that happen to be connected, not work quality.

## 5. 4.5-star grouping
New workers start at 4.0 → always T2 → only offered when no T1 worker is available, whatever their score. The grouping overrides the score.

## 6. V4 simulation (ESTIMATE; faults counted without a "verified" flag; 30-day window)
Biggest movers: Rajitha 32→73 (48 jobs), Sumalatha 72→55, Uma devi 84→44, Rajeswari 61→40, Kavitha vadde 55→29, Nagarani 25→38.
New workers stay ≈25–26 until they complete jobs. Ranking would follow real completed work. Under V4 alone, assignments would still be
limited by the 4.5 grouping unless that rule changes too. Exact assignment changes NOT VERIFIABLE offline (depends on who was online per booking).

## 7. Who changes what
Backend/dispatch: replace recalc function, decide on the 4.5 grouping, add "verified" to faults, stop leaderboard 50 default.
Worker App: rewrite Profile breakdown to the V4 rules (display only).
