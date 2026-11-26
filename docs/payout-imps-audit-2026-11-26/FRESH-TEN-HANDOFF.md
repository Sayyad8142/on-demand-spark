# Handoff: Fresh ten instant payouts for every worker (PROPOSED — not applied)

**Owner decision (2026-11-26):** every worker, new or existing, gets a fresh ten instant payouts. Past paid jobs from before the switch do not count. Payouts already made stay exactly as they are.

## Current live state (LIVE READ, 2026-11-26, `public.worker_payout_milestones`)
- 23 workers have a milestone row; 17 were pre-filled from history by `admin_private.hybrid_backfill` (`initialized_from_history > 0`).
- 9 workers are at 10/10 and currently get no instant payouts.
- Totals: 139 allocated, 97 settled, 221 historical paid payouts counted by the backfill.
- 8 workers already have real post-switch allocations above their history count — those real allocations must be kept.

## Proposed rule
For each worker, only slots used **after** the switch count:
`new_allocated = max(instant_slots_allocated - history_slots, 0)`, where `history_slots = least(initialized_from_history, 10)`. Same for `instant_slots_settled`. Then set `initialized_from_history = 0` so the backfill is never re-applied.

## Step 1 — preview (read-only, run first)
```sql
select worker_id, initialized_from_history, instant_slots_allocated, instant_slots_settled,
       greatest(instant_slots_allocated - least(initialized_from_history,10), 0) as new_allocated,
       greatest(instant_slots_settled  - least(initialized_from_history,10), 0) as new_settled
from public.worker_payout_milestones
where initialized_from_history > 0
order by worker_id;
```
Admin must confirm the preview against each worker's real post-switch instant earnings (`hybrid` earning records with slot numbers) before Step 2. If any worker's post-switch slot numbers don't line up with `new_allocated`, use the real post-switch count instead.

## Step 2 — reset (Admin applies, one transaction)
```sql
begin;
update public.worker_payout_milestones
set instant_slots_allocated = greatest(instant_slots_allocated - least(initialized_from_history,10), 0),
    instant_slots_settled   = greatest(instant_slots_settled  - least(initialized_from_history,10), 0),
    initialized_from_history = 0,
    updated_at = now()
where initialized_from_history > 0;
-- check: no row above 10, settled never above allocated
select count(*) from public.worker_payout_milestones
where instant_slots_allocated > 10 or instant_slots_settled > instant_slots_allocated;  -- must be 0
commit;
```

## Must stay unchanged
- No existing payout, earning, transfer or settlement record is edited, reversed or re-sent.
- Already-held daily earnings are not reclassified to instant (separate decision if wanted).
- `_hybrid_record_earning` logic is unchanged; it simply sees fewer used slots.
- Instant transfers still only move when Admin turns automatic execution on.

## Worker App
No app change needed: screens show only the server's allocated/settled/remaining counts. After the reset, workers see "10 left" (minus any real post-switch use) automatically.
