# Handoff: Fresh ten instant payouts for every worker (PROPOSED — not applied)

**Owner decision (2026-11-26):** every worker, new or existing, gets a fresh ten instant payouts. Past paid jobs from before the switch do not count. Payouts already made stay exactly as they are.

## Current live state (LIVE READ, 2026-11-26, `public.worker_payout_milestones`)
- 23 workers have a milestone row; 17 were pre-filled from history by `admin_private.hybrid_backfill` (`initialized_from_history > 0`).
- 9 workers are at 10/10 and currently get no instant payouts.
- Totals: 139 allocated, 97 settled, 221 historical paid payouts counted by the backfill.
- 8 workers already have real post-switch allocations above their history count — those real allocations must be kept.

## Every place that decides or shows "instant payouts left" (read 2026-11-26)
| Place | Follows "fresh ten"? |
|---|---|
| `admin_private.hybrid_backfill` | **No.** Pre-fills `allocated = settled = least(10, past paid payouts)`. Re-running it would pre-fill any worker without a row again. |
| `public.worker_payout_milestones` data | **No.** 17 rows pre-filled from history; 9 workers at 10/10. |
| `public._hybrid_record_earning` (classifier) | Yes — gives instant while `allocated < 10`; it just reads the wrong counters today. |
| `public._hybrid_sync_payout_status` | Yes — only adds settled slots for real post-switch instant payments. |
| `public.get_my_payout_summary` (worker screen data) | Yes — mode/remaining computed from the counters. |
| `admin_private.hybrid_worker_detail / hybrid_worker_list / hybrid_overview` | Yes — read the counters. |
| Worker App (`hybridPayoutApi.ts`, `HybridPayoutSection`) | Yes — shows server counts only; UI currently off. |

## Verified: real post-switch use equals counters minus history
For all 23 rows, `instant_slots_allocated - least(initialized_from_history,10)` equals the worker's count of `worker_earnings` with `payout_path='instant'`, and 0 of those are paid yet. So the reset should count real instant earnings directly (Step 2).

## Step 1 — preview (read-only)
```sql
select m.worker_id, m.initialized_from_history, m.instant_slots_allocated, m.instant_slots_settled,
  (select count(*) from worker_earnings e where e.worker_id=m.worker_id and e.payout_path='instant') as new_allocated,
  (select count(*) from worker_earnings e where e.worker_id=m.worker_id and e.payout_path='instant' and e.status='paid') as new_settled
from public.worker_payout_milestones m order by m.initialized_from_history desc;
```

## Step 2 — reset counters + stop the backfill pre-filling (Admin applies, one transaction)
```sql
begin;
update public.worker_payout_milestones m
set instant_slots_allocated = least(10,(select count(*) from worker_earnings e where e.worker_id=m.worker_id and e.payout_path='instant')),
    instant_slots_settled   = least(10,(select count(*) from worker_earnings e where e.worker_id=m.worker_id and e.payout_path='instant' and e.status='paid')),
    initialized_from_history = 0,
    updated_at = now()
where m.initialized_from_history > 0;

-- Backfill must never count past payouts again: change its milestone insert to
--   select worker_id, 0, 0, 0 ... on conflict (worker_id) do nothing;
-- (or revoke/retire admin_private.hybrid_backfill entirely).

select count(*) from public.worker_payout_milestones
where instant_slots_allocated > 10 or instant_slots_settled > instant_slots_allocated;  -- must be 0
commit;
```
Expected result: 7 workers at 10/10 drop to 0 used (full ten); others keep only their real post-switch use.

## Open owner question — unpaid daily earnings already held
5 pre-filled workers already have 42 unpaid daily earnings (held for 7 PM settlement) that would have been instant under "fresh ten": up to 34 of them fit inside their fresh ten. None are paid. Reclassifying them is NOT included above and needs owner approval.

## Must stay unchanged
- No existing payout, earning, transfer or settlement record is edited, reversed or re-sent.
- Already-held daily earnings are not reclassified to instant unless the owner approves (see open question).
- `_hybrid_record_earning` logic is unchanged; it simply sees fewer used slots.
- Instant transfers still only move when Admin turns automatic execution on.

## Worker App
No app change needed: screens show only the server's allocated/settled/remaining counts. After the reset, workers see "10 left" (minus any real post-switch use) automatically.
