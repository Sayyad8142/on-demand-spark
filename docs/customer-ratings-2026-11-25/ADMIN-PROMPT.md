# Admin Panel prompt — let workers read their own customer ratings

**Root cause (VERIFIED on hosted DB, 25 Nov 2026):** `public.worker_ratings` (169 rows, the same table the Admin Ratings dashboard uses) has exactly one SELECT policy, `worker_ratings_admin_read` (`has_role(auth.uid(),'admin')`). Signed-in workers therefore receive zero rows (no error), so every completed booking shows "Not rated yet". Booking/worker mapping is correct (0 mismatches; Flat 9198 booking 9ac15dc6… has a 3★ rating with `arrived_late`, `behaviour` for worker 8e03deed…).

## Required change (one migration, read-only access)

```sql
CREATE POLICY worker_ratings_worker_read_own
  ON public.worker_ratings FOR SELECT TO authenticated
  USING (worker_id IN (
    SELECT w.id FROM public.workers w
    WHERE w.user_id = auth.uid()::text OR w.id = auth.uid()
  ));
GRANT SELECT ON public.worker_ratings TO authenticated;
```

- SELECT only. No INSERT/UPDATE/DELETE for workers. Do not change existing policies, triggers (`rating_feedback_validate`, `rating_record_immutable`, `trg_recalc_worker_rating`) or the customer write path.
- `user_id` is readable by the worker through this row; if that is not acceptable, instead expose a SECURITY DEFINER RPC `get_my_booking_ratings(p_booking_ids uuid[])` returning only `booking_id, worker_id, rating, feedback_tags`, scoped to the session's worker, and tell the Worker App team.

## Verify after deploy
As worker 8e03deed…: `select booking_id, rating, feedback_tags from worker_ratings where booking_id = '9ac15dc6-0bbb-4be2-a585-1f6bd643be58'` returns 3 / {arrived_late,behaviour}; another worker gets 0 rows.

## Separate finding — decision needed (no change requested)
`recalc_worker_rating` averages ratings on cancelled bookings too. 5 of 24 rated workers differ, e.g. 8e03deed…: stored 4.88 from 17 ratings vs 4.85 from 13 completed-booking ratings (4 ratings sit on cancelled bookings). Decide whether averages (and Priority Score's rating input) should count only completed bookings. The Worker App does not change this.
