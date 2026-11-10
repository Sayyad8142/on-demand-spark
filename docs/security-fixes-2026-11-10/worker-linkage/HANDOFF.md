# Worker account-linkage fix — handoff for Admin Panel (STAGED, nothing deployed)

Note: `WORKER_LINKAGE_AUDIT.md` was not attached; findings below come from SOURCE (repo) and LIVE (read-only queries, 2026-11-10).

## 1. Vulnerabilities found
| # | Where | Problem | Evidence |
|---|---|---|---|
| 1 | `ensure_worker_profile()` (SECURITY DEFINER) | If a login has no worker row, it finds a worker **by phone** and sets `workers.user_id` to the new login — any new Supabase account with a recycled/duplicate phone takes over the worker (bookings, payouts, bank details). | LIVE function source |
| 2 | `workers_select_own` policy | Anyone whose JWT phone matches can **read** the worker row (bank/UPI) even without being linked. | LIVE policy |
| 3 | `workers_update_own` | Owner may change `id`, `phone` and any other column directly from the app. | LIVE policy, no column guard |
| 4 | App sign-in | After OTP, app ran `update workers set id = <login> where phone = …`. | SOURCE `OtpVerify.tsx` (removed) |
| 5 | App UPI save / profile | Wrote `user_id` from the phone; self-linked any row found by id. | SOURCE `UpiQrUpload.tsx`, `useWorkerProfile.ts` (fixed) |
| 6 | Data | 3 phone numbers already exist on more than one Supabase login — exactly the case #1 hands over. `workers.user_id` not unique. | LIVE |

## 2. Fix
App (done in preview, not published):
- Sign-in no longer touches worker rows. Sign-up refuses to overwrite a worker owned by another login and shows "contact support" (en/hi/te). UPI save no longer writes `user_id`. Self-link only when row id = login. `src/lib/workerLinkage.ts` + 7 tests.

Database (`migration.sql`, staged):
1. `trg_guard_worker_identity`: for app roles (anon/authenticated, **admins included**) `id`, `phone`, `user_id` cannot change; inserts must be for the signed-in login with the verified phone. Server functions/service role unaffected.
2. Policies: read/update/insert by `user_id = auth.uid()` only (phone match and `id` fallback removed).
3. Unique index on `workers.user_id`.
4. `ensure_worker_profile`: never relinks by phone. Phone match → `ACCOUNT_RECOVERY_REQUIRED` + pending request + audit event. Same-login legacy rows (`id = uid`, `user_id` null) still self-link.
5. Recovery: `admin_decide_worker_account_recovery(request_id, approve, note)` — admin only, reason ≥10 chars, requester's verified phone must match, login not already linked, no open booking. Approval moves only `user_id` (worker id, bookings, payouts unchanged), clears push token, sets OFF, supersedes other requests, audited in `worker_account_link_events`.

## 3. Test results
- Database rehearsal (`rehearsal.sh`, throwaway Postgres, live policies/function as fixture): **43/43 pass** — legit sign-in/edit, identity edits refused, reused phone blocked + audited, no cross-worker read/update, duplicate/forged inserts refused, recovery authorization/reason/active-booking/phone-mismatch/already-linked, history preserved, old login loses access, idempotent apply, rollback.
- App: 31 files / 364 tests pass; type check clean.

## 4. Exact deployment dependencies (in order)
1. **Admin Panel review** of `migration.sql`, especially: Admin Panel screens that edit `workers.phone`/`user_id` directly will be refused — they must use a server function (provide one if phone edits are needed).
2. **Audit server functions** that match a worker with `id = auth.uid()` only (not `user_id`). Today id = user_id for all 44 workers, so nothing breaks; after a recovery they would still match the *old* login. List needed before the first approval.
3. Resolve the 3 phone numbers shared by multiple logins (Admin Panel decides which login is genuine).
4. Admin Panel UI for pending recovery requests calling `admin_decide_worker_account_recovery`; on approval also sign out the old login (Supabase Auth admin API).
5. Apply `migration.sql`, re-run the read-only checks (all workers still load; unique index created).
6. Publish the app update (works before and after the migration).
Rollback: `rollback.sql` (keeps audit history).
