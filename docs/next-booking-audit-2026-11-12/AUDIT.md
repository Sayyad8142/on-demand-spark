# Next Booking Priority — audit (2026-11-12). AUDIT ONLY, nothing changed.

Labels: LIVE = confirmed from production records/settings. SOURCE = repo code (may not match deployed). NOT VERIFIED.

## 1. Live dispatch order
- LIVE: Offers are sent by the deployed `dispatch-pending-bookings` engine (records in dispatch_runs: batch_size 5, worker_ttl 60 s, max_attempts 10; triggers "immediate" on new paid booking + cron retries).
- LIVE: Each wave = up to 5 workers offered at the same second, 60 s each; first to accept wins. Next wave of 5 after the wave ends.
- LIVE: `dispatch.uniform_ranking = true` (equal ranking ON). Order is NOT by rating or priority score (e.g. 5.0 / 45-score worker placed 3rd behind 4.33 / 26-score).
- LIVE (inferred from offer ledger): workers offered least recently go first (rotation). Booking 12f37001 order exactly matched oldest previous offer first. After any offer (accept/reject/miss) the worker's last-offer time resets → moves to back of the line.
- NOT VERIFIED: tie-break when several workers were last offered in the same wave (common, since a whole wave shares one time).
- LIVE: Favourite worker gets an exclusive 60 s offer first (DB trigger), then normal waves. Rare: 2 favourite bookings in 60 days.
- LIVE settings: silent-worker suppression ON (3 unanswered in 15 min → skipped 30 min); connection-age limit OFF (0); strict reachability OFF; all extra "nudge" re-dispatch triggers OFF; bookings_enabled currently false.
- Eligibility (SOURCE + DB function get_dispatch_eligible_workers): active, availability ON, not busy, not blocked, has phone token, matching community + service, a saved slot for the current IST half-hour. Repo copy also requires payout ready and permissions not denied.
- IMPORTANT: repo copies of booking-notifications / dispatch-pending-bookings are OLDER than deployed (repo: rating tiers, 30 s, 3 attempts; live: 5-wide waves, 60 s, 10 attempts). Deployed source could not be read from here.

## 2. Feasibility
- Possible as an estimate: "next group" = currently eligible workers in the same community + service, oldest last offer first, top 5 = next group.
- Cannot reuse the production selector directly: it lives inside the deployed engine, not a callable read-only function. get_dispatch_eligible_workers (admin/service only) is close but does not include rotation order, suppression or payout/permission checks.
- Equal priority: show the 5 as one group ("Next group"), never 1st/2nd numbering — they are offered at the same time.
- Offline / busy / no slot / suppressed: not in the line; shown only to themselves with a reason.
- Refresh: on screen open + every 60 s while visible; ~20 workers per community → negligible load.

## 3. Own-position messages (supportable)
- "You're in the next group for bookings." (in top 5 eligible)
- "You're in the booking line." (eligible, not top 5)
- "Turn ON availability to join the booking line." (availability off)
- "You're not in a working slot right now." (no slot this half-hour)
- "You're on a booking now." (busy)
Never: exact position promise, booking time, guarantee.

## 4. Data / security
- Needs ONE new read-only backend function (session-derived worker, own community/service only), returning first names + group flag + own status. No phone, scores, ratings, token, payout, or other workers' reasons.
- No changes to dispatch, eligibility, assignment, payments, availability.

## 5. Risks
- Deployed engine rules may differ from the preview (tie-break, payout/permission filters, cooldowns) → must shadow-check against dispatch_runs before showing.
- Line changes every minute (availability toggles, slot boundaries, other bookings).
- Favourite bookings skip the line.
- Telling workers "next" may cause disappointment if a booking never comes.

## 6. Plan (awaiting approval)
1. Backend owner exports the deployed dispatch-pending-bookings source into the repo (so rules are confirmed, not inferred).
2. Move the eligibility + rotation ordering into one shared read-only SQL function used by dispatch AND the preview (or, without touching dispatch, mirror it and run a 3-7 day shadow comparison vs dispatch_runs; show only if >= 95% match).
3. New worker RPC `get_next_booking_line()` (authenticated, own community/service, first names, group flag, own status).
4. Worker App: replace Top Rated tab with "⚡ Next Booking" (group of 5 + own message), pure display rules + tests; hide on error.
