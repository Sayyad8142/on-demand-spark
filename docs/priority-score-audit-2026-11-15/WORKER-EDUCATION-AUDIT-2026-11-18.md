# Priority Score audit and proposed worker education

18 November 2026, approximately 04:57–05:00 UTC. Read-only audit: no app implementation, scoring changes, database changes, deployment or publication.

## Executive answer

**The saved score is calculated automatically, but it must not be presented as a promise of more bookings.** The production database uses the formula below and recalculates every 15 minutes, plus specific event triggers. The score is clamped to 0–100. Online-hours points are inactive in observed data, missed-alert penalties are not purely worker-controlled, and live dispatch parity remains unverified.

**Next Booking has been removed from the app.** Its previous preview endpoint reported longest-waiting groups, not a demonstrated score-based queue. There is no current Next Booking ranking to educate workers about.

Evidence labels: **HOSTED** = fresh production database read; **SOURCE** = repository source, not hosted edge-function proof; **TEST** = existing isolated tests; **PRIOR** = earlier observations; **PROPOSED** = not implemented; **NOT VERIFIED** = missing runtime/access evidence.

## 1. Exact calculation

HOSTED: `recalc_worker_priority_score_one` writes `workers.priority_score`, `score_reason`, and `priority_score_updated_at`.

```text
Raw = completed + online hours + rating + recent activity
      + high-rating bonus + reachability/acceptance bonuses − penalties
Saved = round(max(0, min(100, Raw)), 2)
```

There is **no base 50 added by this formula**. The database insertion default is 50, which can change at first recalculation. The raw positive maximum is 115, but the saved score cannot exceed 100. Each parameter's points are not necessarily the same as the increase in the final displayed score: caps, existing penalties, rolling-window expiry and rounding matter.

### Exact gain table

| Parameter | Exact contribution | Worker action / limits | When saved |
|---|---|---|---|
| Completed jobs | +5 per completed booking in the last 7 days; max +40 (8 jobs) | Complete genuine assigned jobs. A booking must have server status completed and completion timestamp within the window. More than 8 adds no points to this part. | Completion transition recalculates immediately; phone display can lag. |
| Online hours | +0.4 per recorded hour; max +20 (50 hours) | **Not currently a dependable gain action:** all 46 workers have zero in the input column. Turning ON alone does not produce verified recorded hours. | Next recalculation if the backend input is updated; writer not identified. |
| Effective rating | rating × 5; normally 0–25 for a 0–5 rating | Good service may improve customer average. A +0.1 change in effective average gives +0.5 here, not +0.5 for every review. Admin override takes precedence over customer rating. | No dedicated scoring trigger on rating identified; normally next 15-minute run. |
| Seen recently | +5 if `coalesce(last_seen_at,last_active_at)` is strictly newer than 24 hours ago | Open/use the app so the server records activity; no stacking for repeated opens. | Next recalculation. |
| Rating threshold | +10 if effective rating is at least 4.5 | Maintain 4.5+. One threshold bonus, not +10 per review. | Next recalculation; crossing back below 4.5 removes it. |
| Recent heartbeat | +8 if strictly within 3 minutes; otherwise +3 if strictly within 10 minutes; otherwise 0 | Keep normal app connection working; worker cannot guarantee heartbeat receipt. +8 and +3 are alternatives, not additive. | Next recalculation, using heartbeat age **at that moment**. |
| Recent alert confirmation | +5 if most recent of three saved ACK timestamps is strictly within 30 minutes; otherwise +2 within 2 hours; otherwise 0 | Respond to real offers and keep notification delivery working. ACK includes device evidence, not necessarily a worker action. +5/+2 are alternatives. | Next recalculation unless another scoring event also fires. |
| Acceptance reliability | +2 if acceptance rate is at least 80% and at least 5 counted offers in last 7 days | Accept work you can perform. Denominator includes only accepted/rejected/timed_out statuses; accepted count is numerator. 4 accepted out of 5 qualifies. | No dedicated scoring trigger on accept identified; next 15-minute run or other recalculation. |

Heartbeat, alert-confirmation and acceptance bonuses, and the −15 push penalty below, apply only when `dispatch.priority_score_reachability_boost_enabled` lowercases to `on`. HOSTED current setting: `on`. Maximum combined reachability/acceptance bonus: **15**.

### Exact loss and recovery table

| Cause | Exact deduction / loss | Duration and recovery | Important caveat |
|---|---|---|---|
| Not reached event | −5 for each `worker_reach_events.reach_outcome=not_reached` in last 7 days | Each event stops counting when it leaves the rolling window; reflected at next recalculation. | Must be recorded by server/admin; not every missed phone call automatically equals this event. |
| Worker fault event | −20 per row in `worker_fault_events` in last 7 days; no separate part cap | Ages out after 7 days, or correction of erroneous event followed by recalculation. | All fault rows count regardless of reason/severity; cancellation logs one only for worker fault and a `worker_%` reason code. Duplicate rows could multiply penalties. |
| Missing delivery confirmation | −2 × min(`no_ack_count`,10); max −20 | **No automatic 7-day expiry for this counter.** It can reset on accepted offer or token repair/change, or decrement on first ACK evidence. Score reflects changed counter at next recalculation. | Not a lifetime irreversible penalty. Delivery/device problems can cause it; do not blame worker or promise a fixed deduction per tap. If count is above 10, reducing it by one may leave penalty unchanged. |
| Push deprioritization | −15 while `push_deprioritized_until > now()` and boost is ON | Stops when expiry passes or field is cleared, then recalculation. One inspected no-ACK transition sets 30 minutes; other writers may differ. | Not a universal −15 per missed booking. May stack with no-ACK deduction. |
| Old completed job | Loses 5 when job exits 7-day window, unless remaining jobs still exceed cap | Complete new genuine jobs to replace expired ones. | Natural expiry, not punishment. |
| Lower average rating | Loses 5 × drop in effective rating | Improved effective average can recover it; admin overrides control effective rating when set. | Example 4.5→4.4 loses 0.5 rating points **plus 10 threshold points**. |
| Old activity / heartbeat / ACK | Recent activity loses 5 after 24h; heartbeat 8→3→0; ACK 5→2→0 | A fresh recorded event restores corresponding tier at next calculation. | Exact equality at 3m/10m/30m/2h fails the shorter tier because comparisons use `>`. |
| Acceptance below threshold | Loses the +2 bonus if below 80% or counted sample below 5 | Improve rolling acceptance rate or wait for old counted outcomes to leave window. | Rejection/timed_out has no separate fixed deduction in this formula. |

No permanent score deduction is defined for a dated reach/fault row; the no-ACK counter can persist until recovery and has no date window. No direct score points are awarded for OTP entry, availability ON itself, payout amount, training completion, or selecting more communities/services.

## 2. Update timing — calculation versus what the worker sees

- HOSTED cron: `recalc-worker-priority-scores`, `*/15 * * * *`, calls `recalc_worker_priority_scores` for all workers. Last inspected runs at 04:00, 04:15, 04:30 and 04:45 UTC succeeded.
- HOSTED event triggers: completed-booking transition; new fault event; new reach event; inactive→active worker transition. These call the single-worker formula within the database operation.
- No formula caller dedicated to heartbeat, ACK, rating, acceptance or availability was found among inspected DB functions/triggers. Those changes ordinarily await the next quarter-hour calculation. Hosted edge functions may add calls: NOT VERIFIED.
- SOURCE Profile reads an account-keyed query with 2-minute freshness and no own-worker realtime subscription in `useWorkerProfile`; edits invalidate it. Home and leaderboard have separate reads. Do not promise instant synchronized screen updates.
- A 3-minute heartbeat bonus sampled every 15 minutes is timing-sensitive. Reopening may affect server timestamps but does not itself guarantee an immediate +8 score.

## 3. Fresh data and arithmetic checks

HOSTED snapshot: 46 workers; min 0, max 85, average 28.17; all score timestamps at 04:45:00 UTC. All 46 have zero recorded seven-day online hours; none has an admin rating override. Six have not-reached counts, none has worker-fault count, five have no-ACK count; one has count ≥10 (maximum 11). No worker had an active push-deprioritized expiry at inspection.

All 46 `score_reason.final` values matched stored score. Summing rounded explanation parts matched 42 exactly; maximum discrepancy was **0.05**, consistent with explanation parts rounded to 1 decimal versus final saved at 2 decimals. This is not evidence of a calculation arithmetic bug. A future breakdown must acknowledge rounding/clamping rather than invent missing points.

HOSTED default rating is **4.0**, not the older note's 5.0. The active protected-field trigger's insert patch also uses 4.0, subject to guard mode. Existing account rating, enrollment paths and overrides can differ; do not teach a guaranteed initial score/rating.

Example of **formula only**, not a real account: 3 recent completed jobs, zero online-hour input, effective rating 5, seen recently, heartbeat under 3m, ACK under 30m, no acceptance bonus or penalties → 15+0+25+5+10+8+5 = **68**. Default rating 4, no jobs, seen recently and fresh heartbeat → 0+0+20+5+0+8 = **33**, not a guaranteed signup score.

## 4. Actual booking priority

- HOSTED `dispatch.uniform_ranking=true`; connection-freshness-hours=0 means no age exclusion in its helper. Eligibility, ordering and performance scoring are distinct.
- SOURCE old repository `booking-notifications` sorts priority_score, rating and last_offer_at and has rating tiers. This copy is not verified as hosted; supplied live dispatcher versions differ. It cannot establish that higher score increases current booking chance.
- HOSTED helper formulas/orderings differ: `get_dispatch_eligible_workers` orders names; another helper uses freshness/rating; `get_worker_score_debug` orders high-rating bucket, rating, score and last_seen. None proves the actual edge dispatcher selection path.
- HOSTED four-day offers: 41 booking groups, 5–12 offer rows per booking; 17 had all rows created at identical timestamps. This supports group dispatch, not equal physical delivery, score causality or guaranteed next worker.
- PRIOR removed Next Booking endpoint reported longest_waiting. No current app Next Booking tab/request remains. No verified connection between displayed score and that old group estimate.
- **Answer: more bookings from higher score is NOT VERIFIED.** Do not promise it; obtain exact hosted selector/source, uniform-mode semantics, preferred-worker and tie-break rules, and controlled selection evidence first.

## 5. Inconsistencies, inactive inputs and security findings

| Finding | Evidence / impact | Recommendation — not implemented |
|---|---|---|
| Online hours unusable | All inputs zero; no DB function writer found by inspected assignment search. Up to 20 raw points unreachable currently. | Identify actual writer and audit completeness before advertising points; choose repair/removal only after approval. |
| Mutable counter differs from rolling events | No-ACK persists but recovery paths reset/decrement. Prior “lifetime penalty” description incomplete. | Explain device issue fairly; audit all sender/ACK writers and preserve recovery. |
| Alert timestamps may differ | Score reads last_device_ack/last_popup_ack/last_acknowledged_booking; inspected `record_offer_ack` primarily writes last_notification_received. | Verify each scored timestamp is populated by hosted transport; do not claim every shown popup adds +5. |
| Mixed offer status vocabularies | 7-day data includes accepted 52, rejected 32, timed_out 32, lost 249, not_delivered 62, unreachable 44, failed 1. Formula counts only first three; older ACK trigger increments on `timeout` while timeout function writes `timed_out`/`not_delivered`. | Review all producers and denominator deliberately; do not equate all nonacceptance with rejection or worker fault. |
| Rating counted twice | Continuous rating term plus 10-point cliff at 4.5. | Explain exact cliff; simplification needs rule-change approval. |
| Multiple scoring formulas | `get_worker_live_stats` uses uncapped completed×5, online×2, acceptance×50, completion-recency +10; shadow formula exists separately. Worker execute denied for inspected score/debug/recalc RPCs. | Declare saved score formula authoritative for education; retire/label other formulas after owner review. |
| Fields not fully enforced against direct edits | HOSTED `worker_field_guard_mode=observe`; active guard logs most protected-field updates rather than reverting them, except core fields. priority_score is in protected list. | Security audit of grants/RLS and older clients required before claiming worker cannot edit score. No bypass attempted; no security settings changed. |
| Rounded breakdown, merged penalties | Current parser reads server parts, not local invented formula, but aggregates connection/penalties, omits zero parts and does not explain caps/windows. Missing score displayed as 0 by Profile. | Future education uses confirmed saved parts and timestamp, safe unavailable state, explicit caps/rounding; never fabricate granular penalty causes. |
| Leaderboard fallback | Repository edge copy still returns score `||50` and rating `||5`; frontend own-score read preserves zero. Hosted leaderboard parity not verified. | Review staged server correction separately; do not deploy from this audit. |
| Cross-screen freshness | Separate caches/reads and no dedicated realtime score refresh in Profile. | Propose shared server score read/foreground refresh after approval. |

Observed no-ACK recovery: active accepted-offer trigger resets counter and clears push deprioritization; active non-null token-change trigger resets counter; `record_offer_ack` function decrements on first delivery evidence; repair function resets. Hosted receiver calling the latter two and real-device behavior NOT VERIFIED. Do not tell workers to rotate tokens, reinstall or manipulate ACKs to farm points.

## 6. Proposed “How to Improve Your Priority Score” section

**PROPOSED ONLY — no UI added.** Use existing app styling and worker language selection; keep backend identifiers/rules untranslated. Name it a performance explanation, not booking priority.

### Worker-facing introduction

> Your score shows recent work and connection records. A higher score does not guarantee more bookings. Your score usually refreshes every 15 minutes; completed jobs and recorded reach/fault events can update it sooner.

### Do this to gain points

> **Finish your jobs:** +5 for each completed job in the last 7 days, up to +40.
>
> **Provide good service:** each 0.1 increase in your average rating adds 0.5 rating points. A rating of 4.5 or above adds another +10.
>
> **Use the app regularly:** a recorded visit in the last 24 hours adds +5.
>
> **Keep your connection working:** a recent recorded heartbeat can add +8 or +3. Recorded alert confirmation can add +5 or +2. These points depend on the phone and server, and do not stack repeatedly.
>
> **Accept work you can do:** at least 4 accepted out of 5 counted offers in the last 7 days earns a +2 bonus; maintain at least 80% as the count grows.

Do **not** advertise online-hour points while all inputs are zero. Do not encourage workers to accept unsuitable jobs to increase score.

### Avoid this to prevent losing points

> **A recorded not-reached event:** −5; stops counting after 7 days.
>
> **A recorded worker-fault event:** −20; stops counting after 7 days.
>
> **Missing phone delivery confirmation:** −2 per counted incident, up to −20. This may be a phone problem, not your fault. Genuine delivery/acceptance or verified repair can clear or reduce it.
>
> **Temporary notification trouble:** an additional −15 may apply until the recorded restriction expires.
>
> Jobs and bonuses can expire naturally. This is not a permanent punishment. If a record looks wrong, request a review rather than assuming you caused it.

### Your score breakdown

Display only confirmed own-worker data:

- Current saved score /100 and “Last updated” in IST.
- Completed jobs; recorded online hours clearly marked inactive/unavailable for education until verified; customer/effective rating; recent activity; 4.5+ bonus; combined connection/acceptance points; combined deductions.
- Positive total, negative total, cap-at-100/floor-at-0 and rounding note. These totals need not equal the capped final score.
- Specific next action only when supporting input is confirmed (for example seven recent completed jobs → one more qualifying completion can add 5 to this part). Above cap or unknown values: no invented gain.
- Show “Details unavailable” if score_reason is missing/mismatched; no base 50, fake penalties or guaranteed next booking.
- Granular deduction history requires a reviewed own-worker server contract and safe access; do not infer causes from combined penalty points.

## 7. Recommendations and approval gates

1. Approve truthful performance wording and breakdown design only after reviewing this table.
2. Resolve online-hours input, observe-mode score-field protection and hosted timestamp/status inconsistencies before promising full accuracy.
3. Obtain hosted dispatch and leaderboard source; verify whether uniform ranking ignores score or uses any tie-break. Maintain “no more-bookings promise” until proven.
4. Review rounding/cap handling, null-score states and shared refresh in the future education implementation.
5. Any formula, penalty window, guard enforcement or dispatch change requires separate approval and isolated tests; keep calculation unchanged for now.

## Verification and limits

- TEST: 20 existing score-breakdown/badge/home-summary tests pass; no tests or application files changed by this audit. Tests establish display behavior, not live formula/dispatch parity.
- HOSTED: arithmetic saved-final check, input statistics, scoring source, triggers, cron schedule/results and relevant settings read without mutations.
- SOURCE: reported `use-mobile.tsx` UMD text is absent; explicit React imports already present and recent preview logs report build OK. Error not reproduced; no speculative hook edits.
- NOT VERIFIED: authenticated worker education/score screen, installed APK, real-device timestamps, production edge-function source and controlled dispatch decisions. No real offers or OTP/payout actions performed.

**Verdict: saved calculation active; education can be proposed accurately with these limitations; production booking advantage unproven. Nothing implemented or published.**