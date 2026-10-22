# Step 1 deployment report — Worker Focus diagnostic tables

Applied: 2026-10-22 20:55 UTC (02:25 IST, outside 07:00–19:00 slot window). 0 live offers at the time.
Migration: exactly `staged/001_worker_diagnostics_DRAFT.sql` (without the commented rollback). Rollback file: `staged/001_worker_diagnostics_ROLLBACK.sql`.

## Pre-checks
- No name conflicts (0 tables/functions). `workers.id` uuid, `has_role` present.
- Backup / recovery point: NOT VERIFIED — the Supabase plan's backup/PITR status cannot be read from here. Check Dashboard → Database → Backups.

## Created (VERIFIED)
- Tables `worker_diagnostic_events`, `worker_diagnostic_status`, RLS on both, 0 rows.
- Indexes: both primary keys, unique (worker_id, event_id), (worker_id, observed_at desc).
- Policies: "admins read diag events", "admins read diag status" — SELECT, authenticated, `has_role(auth.uid(),'admin')`.
- Function `upsert_worker_diagnostic_status`: execute = service_role only (anon false, authenticated false).

## Unaffected (VERIFIED)
- Workers ON/busy/blocked checksum identical before and after.
- Bookings: 864 rows, last update 17:32 UTC — unchanged.
- Payouts: 380 rows, unchanged count; `updated_at` moved by the existing 5-minute payout sync cron job (runs every 5 min, unrelated).
- No new user triggers on existing tables (FK adds only internal checks).

## Unexpected effect — needs your decision
Production's default privileges also gave `anon` and `authenticated` full table rights (SELECT/INSERT/UPDATE/DELETE)
on the two new tables. RLS still blocks all of it (no policy exists for anon, nor for any write), so no data is exposed
and nothing can be written — but it is wider than designed. Proposed fix (needs approval):
```sql
revoke all on public.worker_diagnostic_events, public.worker_diagnostic_status from anon;
revoke insert, update, delete, truncate, references, trigger on public.worker_diagnostic_events, public.worker_diagnostic_status from authenticated;
revoke all on sequence public.worker_diagnostic_events_id_seq from anon, authenticated;
```

## Access test with real accounts
- Admin account (user_roles admin) satisfies the read policy; non-admin account does not → 0 rows. VERIFIED by policy data only.
- Live signed-in request test: NOT RUN — needs an Admin Panel sign-in session; the tables are empty, so it exposes nothing either way.

## Step 2 receiver backup — BLOCKED
The repo copy of `ack-booking-delivery` is NOT what is running (live answers with the old "received/opened" contract).
The live source can't be downloaded from here. Export it from Supabase Dashboard → Edge Functions → ack-booking-delivery
(Code tab / download), plus its verify_jwt setting and deploy date, and save as `docs/ack-recovery/LIVE_BACKUP/index.ts`.

## Not done (by instruction)
No receiver deployed, no reporting enabled, Worker App not published, no other production change.
