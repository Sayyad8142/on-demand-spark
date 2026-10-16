# Isolated test project setup (synthetic data only)
1. In Supabase, create a **new project** in a separate organisation (e.g. "didi-priority-test"). Note its ref; it must not be `paywwbuqycovjopryele`.
2. Generate new keys there. Never copy production keys, service-role key, Firebase or Cashfree secrets.
3. Export **schema only** from production (`supabase db dump --schema-only` run by an owner) - no data, no auth users.
4. Load the schema into the test project. Strip cron jobs, webhooks and edge-function URLs that point to production.
5. Seed synthetic rows: 10 workers (one at 0, one at 100, one new), bookings, ratings, fault events incl. one duplicate.
6. Create two test auth users: one with `admin` in `user_roles`, one linked to a synthetic worker.
7. Guard: every script starts with `SELECT CASE WHEN current_setting('app.project_ref',true)='paywwbuqycovjopryele' THEN 1/0 END;` and is run by hand against the test URL only.
8. Run drafts 001 -> 003 -> 004 with COMMIT.
9. Tests: as the worker, try REST PATCH on priority_score/rating/fault events (must fail); edit name/photo (must succeed); call admin_set_worker_rating (must fail); as admin (must succeed + audit row); compare compute_priority_score_v4 to formula30d.ts for every seed; run dispatch on synthetic bookings and confirm order is unchanged.
10. Delete the test project afterwards, or keep it with synthetic data only.
