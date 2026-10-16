# Admin Panel brief – Priority Score V4 (separate project; draft)
All writes go through server functions; the panel never writes tables directly.

1. **Live vs V4 shadow:** per worker show `priority_score` (live, used by dispatch) beside `priority_score_v4` + `priority_score_v4_as_of`, and the difference. Label V4 "Preview – not used for bookings".
2. **Complaints:** list `worker_complaints` (pending first) with booking, worker, reason, details, evidence. Buttons Verify / Reject call `admin_decide_complaint(id, verified, note)`; a note is required. Decisions are final; show `worker_complaint_events` as history.
3. **Penalty history:** list `worker_fault_events` per worker with code, source, date, verified by/at. Only no-show and cancel-after-accept can be verified, via `admin_verify_fault`. Refused/late/not-moving show "0 points".
4. **Rating adjustments:** only `admin_set_worker_rating` / `admin_clear_worker_rating`; require a reason; show `worker_score_audit`.
5. **Audit:** one timeline merging score audit, complaint events and fault verifications.
6. **Reporting:** per worker and community – jobs (30d), bonus status, penalties (30d), V4 breakdown (25 + jobs + bonus − penalties), badge, and live-vs-V4 rank change.
Formula: score = clamp(0,100, 25 + completed jobs in last 30 days + 5 if rating ≥ 4.8 with ≥ 5 ratings − verified penalties in last 30 days, each incident once).
