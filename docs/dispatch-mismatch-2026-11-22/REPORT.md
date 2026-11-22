# 22 November Worker ranking / dispatch mismatch

## Scope and evidence labels
No deployment, dispatch/configuration/score mutation, notification send, release/version change, publication or Next Booking activation. HOSTED = read-only database/HTTP evidence; SOURCE = checked-out code; REPLAY = tests using recorded input and Admin snapshot, not hosted execution. Exact hosted edge source is unavailable. Admin snapshot: Didi Now Dashboard, commit bc654c42.

## HOSTED — exact example
Booking `f4b386f5-f8ca-4c9b-ae0a-a7b937dacc78`, Prestige High Fields / Maid, created 22 Nov 10:10:51.474 IST. The preceding booking `39556ac1-8cdf-4f24-a3de-1ad7de74f696` started at 10:07:18 IST and used the same first five.

| Worker | Score saved in dispatch event | Offer IST | Result / delivery evidence |
|---|---:|---|---|
| Anusha m | 40.5 | 10:10:53.108, batch 1 | FCM sent; no recorded phone receipt/popup; not_delivered |
| Kethavath mounika | 40 | same, batch 1 | Phone receipt and popup recorded; timed_out |
| Nagarani m | 30.8 | same, batch 1 | Phone receipt and popup recorded; timed_out |
| Jyothi G | 24 | same, batch 1 | FCM sent; no recorded receipt/popup; not_delivered |
| Kalyani sapavath | 23 | same, batch 1 | FCM sent; no recorded receipt/popup; not_delivered |
| Sid | 58 | 10:12:01.087, batch 2 | Phone receipt/popup; accepted at 10:12:05.789 |
| Kaveri vadde | 23 | same, batch 2 | FCM sent; lost when Sid accepted; no recorded receipt/popup |
| Kavitha vadde | 15 | same, batch 2 | FCM sent; lost when Sid accepted; no recorded receipt/popup |
| Didi Now private limited | 55 in user's example/current row | No request in either booking | Current server push token absent, status missing; historical token state not saved per worker |

First-wave deadline 10:11:53.108; timeout processed 10:12:00.132, next wave 10:12:01.087. Eight offerable workers, not nine: runs record workers_eligible=8. First size five; retry size configured five but only three untried workers remained. FCM acceptance is not proof of delivery or a worker seeing a popup. All worker_seen fields are absent; do not claim seen. Lost requests are not failed delivery evidence.

## Why Sid was later — HOSTED + SOURCE + REPLAY
Live ops setting `dispatch.uniform_ranking=true` (last changed 4 Nov). Admin dispatcher reads this and ranks longest since last offer first. Score/rating are equalized in memory for this mode, never written to workers. Stable ties retain the base query order `priority_score DESC`.

Before 10:10, the first five had last been offered at 10:07:19.655. Sid, Kaveri and Kavitha had last been offered at 10:09:01.162, in the earlier booking's second wave. Thus the first five had waited longer. Sid's 58 does not override that rotation. Exact stored order is reproduced by the Admin snapshot's uniform comparator using these historical request times and event scores.

SOURCE (not hosted source proof): uniform OFF orders connection freshness groups, reliable Bayesian rating, latest connection, score, then last offer. SOURCE also contains a contradictory stale comment saying last_offer_at is unused even though rankWorkers uses it. Rating-tier event labels use raw ratings even under uniform mode; `selection_reason=low_rating_fallback` is not proof that low rating caused selection. None of these labels should replace the configured algorithm.

## Confirmed preview inconsistencies — SOURCE
Admin `src/lib/simpleDispatch.ts` explicitly mirrors a *staged simplified* algorithm, not current dispatch. `DispatchPoolPanel.tsx` says "not live" but still displays "eligible" and "next batch":
- It sorts raw rating, neutral unrated=4.0, then worker ID; does not read uniform mode or live comparator.
- It ignores missing push tokens; hence a tokenless account can be counted eligible.
- It hardcodes batch five and does not pass assigned/cancelled/pastDeadline guards.
- It reads current worker state against booking creation-time slot, not a saved dispatch-time snapshot; refresh is only booking ID dependent, not worker/config changes.
- It lacks the live canonical eligibility intersection and approval predicate. The hosted canonical RPC itself currently lacks explicit approval checks (previous staged approval repair remains pending).

Admin has a separate ranking-mirror/next-group endpoint designed around dispatch. It is not what Simple Preview calls. It is an estimate and not proof of future state.

## Prepared fixes — NOT DEPLOYED
Worker presentation: label rank as performance/earnings and replace "Prio" with Score; keep disclaimers and Top Workers/Top Earners. Preserve exact 40.5 (own-score rounding bug corrected), clear stale own score/data on failed/missing worker fetch. No stored score, rank ordering or booking behavior changed.

Admin replacement staged at `staged/DispatchPoolPanel.tsx` + `staged/recordedDispatch.ts`: uses existing admin-guarded `get_booking_dispatch_audit` instead of inventing a future batch. Shows recorded sequence, run counts and statuses; no PII/token/score fields copied. Does not claim future position. Admin project cannot be edited from this checkout. No SQL or edge replacement is justified merely by this example.

Replay tests import archived Admin comparator and Simple Preview, reconstruct five/three batches, prove the 9-vs-8 token filter difference, and test historical projection/fail-closed behavior. These test code against historical records; they are not a new production send.

Tests: 65 focused checks passed; full suite 769 tests across 70 files passed. Preview build OK. Actual Worker leaderboard component checked with intercepted fixture response at 393×805 and 1280×1800: exact 40.5, performance label, earnings navigation, no Next Booking tab, no overflow/page errors; mobile screenshot inspected. This is isolated fixture evidence, not a signed-in hosted/phone end-to-end test. Staged Admin projection is unit-tested; its Admin UI/role/session integration remains unverified.

## NOT VERIFIED / approval handoff
- Exact currently deployed dispatcher source/hash: edge logs were unavailable/no matches. The GET `dispatch-version-check` returns `2026-09-27.exact-slot-v2`, but SOURCE shows this check is a separately hardcoded constant, not introspection of dispatch. Admin dispatch snapshot says `2026-10-27.caller-auth-observe`; this version check cannot prove parity.
- Didi Now private limited's precise historical token/notification state at 10:10, and per-worker exclusion history (selected rows only logged for wave 1). Current missing token + recorded disconnected_not_offered=1 explains the 8-vs-9 discrepancy but is not a time-machine proof.
- Full Admin UI / signed-in Worker phone flow cannot be verified from an external unmanaged session. No Next Booking enabled or restored: retain the previous removal/gate until backend parity, authenticated eligibility and owner approval.
- Obtain hosted dispatcher source from the Admin owner, compare with recorded replay and approved uniform rule; obtain approval to apply the staged Admin panel and publish Worker wording. Keep rotation; do not switch to score ordering.
- Native receipt/expiry/cancel/accept checks and token repair require named Android phones and approval. Missing ACK means unconfirmed receipt, not proof of no alert.

## Diagnostics
The supplied use-mobile error text does not appear in the hook (explicit React imports). `src/routes/__root.tsx` does not exist in this React/Vite project. No fake Window property or route was added.