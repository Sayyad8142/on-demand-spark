-- DRAFT test script for the ISOLATED project only, after 001,003,004,005 are committed.
-- Each block runs in its own transaction and rolls back. Expected result in comments.
-- Replace :worker_uid / :worker_id / :admin_uid with synthetic seed values.

-- T1 anon cannot touch scores or faults
BEGIN; SET LOCAL role anon;
UPDATE workers SET priority_score = 99;                                   -- EXPECT: permission denied
INSERT INTO worker_fault_events(worker_id, reason_code) VALUES (gen_random_uuid(),'x'); -- EXPECT: denied
SELECT count(*) FROM worker_fault_events;                                  -- EXPECT: denied
ROLLBACK;

-- T2 worker: profile edit OK, score/rating/fault edits blocked, own faults readable
BEGIN; SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',':worker_uid','role','authenticated')::text, true);
UPDATE workers SET full_name = 'Test Name' WHERE id = ':worker_id';         -- EXPECT: 1 row
UPDATE workers SET priority_score = 99 WHERE id = ':worker_id';            -- EXPECT: score fields are server-managed
UPDATE workers SET rating = 5 WHERE id = ':worker_id';                     -- EXPECT: error
UPDATE workers SET admin_override_rating = 5 WHERE id = ':worker_id';      -- EXPECT: error
INSERT INTO workers(id, phone, full_name, priority_score) VALUES (gen_random_uuid(),'9','x',99) RETURNING priority_score; -- EXPECT: 25 (or RLS deny)
INSERT INTO worker_fault_events(worker_id, reason_code) VALUES (':worker_id','x'); -- EXPECT: denied
SELECT count(*) FROM worker_fault_events WHERE worker_id <> ':worker_id';  -- EXPECT: 0
ROLLBACK;

-- T3 worker cannot use admin/alternative RPCs
BEGIN; SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',':worker_uid','role','authenticated')::text, true);
SELECT admin_set_worker_rating(':worker_id', 5);                          -- EXPECT: forbidden
SELECT recalc_worker_rating(':worker_id');                                -- EXPECT: permission denied
SELECT admin_log_worker_fault(':worker_id', NULL, 'worker_no_show','cancel'); -- EXPECT: forbidden
SELECT admin_decide_complaint(gen_random_uuid(), true, 'x');              -- EXPECT: forbidden
SELECT admin_verify_fault(gen_random_uuid());                             -- EXPECT: forbidden
SELECT compute_priority_score_v4(':worker_id', now());                    -- EXPECT: permission denied
ROLLBACK;

-- T4 admin succeeds and is audited; duplicates stay single
BEGIN; SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',':admin_uid','role','authenticated')::text, true);
SELECT admin_set_worker_rating(':worker_id', 4.9);                        -- EXPECT: ok
SELECT count(*) FROM worker_score_audit WHERE worker_id = ':worker_id';   -- EXPECT: 1
-- create complaint, decide twice -> exactly one complaint_verified fault row
ROLLBACK;

-- T5 no remaining client-callable definer function writes score fields
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
   AND pg_get_functiondef(p.oid) ~* '(priority_score|admin_override_rating|\mrating\M)\s*='
   AND pg_get_functiondef(p.oid) !~* 'is_admin\(\)';                      -- EXPECT: 0 rows
