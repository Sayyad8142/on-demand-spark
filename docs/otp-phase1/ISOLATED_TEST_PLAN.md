# Phase 1 — Isolated test environment plan (DRAFT, nothing created)
Goal: a separate Supabase project that copies production's structure but holds only fake data, sends no real messages or payments, and cannot write to production.

## 1. Create the test project
1. In the Supabase dashboard: New project, name `didinow-otp-test`, in a different organization or at least a different project ref from `paywwbuqycovjopryele`. Region: same as production.
2. Write down its ref, URL, anon key and service_role key. Store them only in a local `.env.test`. Never put them in the Lovable project's `.env`.

## 2. Copy the structure only (production is only read)
```bash
# Read-only dump from production: structure, functions, triggers, policies, grants. No rows.
supabase db dump --db-url "$PROD_DB_URL_READONLY" --schema public -f schema.sql
supabase db dump --db-url "$PROD_DB_URL_READONLY" --role-only -f roles.sql   # if custom roles exist
# Load into the TEST project only:
psql "$TEST_DB_URL" -f roles.sql
psql "$TEST_DB_URL" -f schema.sql
```
- `schema.sql` includes the database functions (e.g. `is_admin`, `has_role`, `_create_worker_payout_core`), the triggers, the RLS policies and the grants.
- Do NOT use `--data-only` and do NOT dump the `auth`, `storage` or `vault` schemas from production.
- Check: in the test DB, `SELECT count(*) FROM bookings` must be 0.
- `PROD_DB_URL_READONLY` should be a read-only role if possible. Delete it from the shell after the dump (`unset`).

## 3. Neutralize side effects in the test DB
Run on the TEST database only:
```sql
-- stop all scheduled jobs copied by the dump (pg_cron is per-project; usually empty, verify)
SELECT cron.unschedule(jobid) FROM cron.job;
-- no outbound HTTP from triggers/functions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC;   -- if pg_net present
-- vault: leave EMPTY (no CRON_SHARED_SECRET, no FCM/Cashfree keys)
```
- Search `schema.sql` for hardcoded `paywwbuqycovjopryele` URLs (e.g. in `net.http_post` calls or cron commands). Replace each with an invalid host in the test copy, or drop that function.

## 4. Edge functions in the test project
- Deploy only `complete-booking-with-otp`: `supabase functions deploy complete-booking-with-otp --project-ref <TEST_REF> --no-verify-jwt`.
- Test project secrets: only `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, all for the TEST project (Supabase sets these itself).
- Do NOT set: FCM / Firebase service account, Cashfree, RazorpayX, Pushcut, Twilio, any webhook URL, `CRON_SHARED_SECRET`.
- The function's fallback URL is hardcoded to production (`?? "https://paywwbuqycovjopryele.supabase.co"`). In the test project `SUPABASE_URL` is always set, so the fallback is never used. Still confirm it in the function logs (it must print the test host), or remove the fallback in the test copy.

## 5. Fake data (TEST DB only)
```sql
-- fake admin + worker + customer (Firebase-style text UIDs or uuids as used in prod)
INSERT INTO user_roles (user_id, role) VALUES ('<fake-admin-uuid>', 'admin');
INSERT INTO workers (id, user_id, full_name, phone, upi_id, community)
  VALUES (gen_random_uuid(), 'test-worker-uid-1', 'TEST Worker 1', '+910000000001', 'test@upi', 'qa_villa_test');
INSERT INTO communities (value, name, platform_fee_percent) VALUES ('qa_villa_test','QA Villa Test Community',0);
-- bookings in each state: assigned, started, completed; with completion_otp '1234'
-- one pre-existing worker_payouts row (status 'created') to prove it stays unchanged
```
Phone numbers use `+91000000000x`. UPI IDs end with `@upi` and are fake.

## 6. Prevent accidental production connections
| Guard | How |
|---|---|
| Separate env file | `.env.test` with `TEST_SUPABASE_URL`, `TEST_DB_URL`. Production variables are never exported in the same shell |
| Hard check in every test script | Abort if the URL or DB URL contains `paywwbuqycovjopryele` |
| No production service_role key on the test machine | Do not fetch it. Not needed |
| Lovable project untouched | Its `.env` and `supabase/config.toml` stay pointed at production, and no tests run from it |
| Edge functions | Deployed with `--project-ref <TEST_REF>` only, and the command is checked before running |

Guard snippet:
```bash
case "$TEST_DB_URL$TEST_SUPABASE_URL" in *paywwbuqycovjopryele*) echo "REFUSING: production ref"; exit 1;; esac
```

## 7. Test run
1. Before the patch: run the 15 scenarios from `completion_lock.offline.test.ts` as SQL against the test DB. The two "forgery works" tests should succeed, which confirms the problem exists.
2. Apply `001_completion_lock_DRAFT.sql`.
3. Re-run all 15 scenarios. Then call the test `complete-booking-with-otp` with a fake worker JWT and OTP `1234`. Expect exactly one payout, and a second call returns `already_completed`.
4. Check that the existing completed booking and its payout are unchanged (compare before/after snapshots).
5. Apply `001_completion_lock_ROLLBACK.sql`. Confirm the trigger and both functions are gone and the data is unchanged.
6. Delete the test project when finished.
