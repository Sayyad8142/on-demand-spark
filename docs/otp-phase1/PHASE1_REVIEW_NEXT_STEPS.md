# DIDI NOW — Phase 1 patch review & next steps (18 Oct 2026)
Read-only review. No new patch was written. Nothing was applied, deployed or published.

## 1. Patch readiness
| Item | Status |
|---|---|
| Draft SQL `001_completion_lock_DRAFT.sql` | Present |
| Offline tests `completion_lock.offline.test.ts` | Present. 15/15 pass (re-run today with `bun test`, PGlite) |
| Rollback | Present, at the bottom of the draft SQL (drop 1 trigger + 2 functions) |
| Worker / customer direct completion | Blocked (TEST) |
| Server End OTP completion (service_role) | Still works (TEST) |
| Admin completion | Allowed only via `is_admin()`, logged to `booking_events` as `admin_completion` (TEST) |
| Payout from unauthorized completion | None created (TEST) |
| Existing completed bookings | Unchanged. The draft adds a BEFORE UPDATE trigger only, with no UPDATE or DELETE of data (SOURCE). Side effect: a completed booking can no longer be reopened except by trusted callers |

Gap: there is no standalone rollback file. Optional: copy the rollback block into `001_completion_lock_ROLLBACK.sql`.

## 2. Cross-project dependencies
No other projects are reachable from this workspace (checked with cross_project list). Each project has to be checked inside its own project.

**Didi Now User App (customer)**
- Search for `.from("bookings").update(` and any RPC that writes `status`, `completion_source`, `completed_by`, `otp_verified_at`, `completed_at` or `completion_otp`.
- Expected: none of these runs with a customer session. If one does, it will start failing after the patch (intended), so it must move to a server function first.
- Confirm how the customer sees the end code. It is read only, never written by the customer.

**Didi Now Admin Panel**
- List every path that completes or reopens a booking: direct table updates, `admin_set_booking_status`, `admin_complete_booking_with_otp`, `admin_recreate_cancelled_booking`.
- Confirm that each one runs as a user who passes `is_admin()` (a `user_roles` admin), or as service_role.
- Confirm that reopening a completed booking is not a normal admin action. If it is, it still works for admins.
- Check the commission screen. See section 3.

**Shared Supabase backend**
- List the cron jobs and SQL jobs that set `status='completed'`. Each one must run as service_role or postgres.
- List the other BEFORE UPDATE triggers on `bookings` and confirm none of them needs completion fields changed by a user.
- After applying the patch on a test copy, re-run the security linter.

**Worker App (this project)**
- SOURCE: the app completes jobs only through `complete-booking-with-otp` (service_role), so it is unaffected.
- Still needed: one device test on 10.0.02 that completes a job with the end code.

## 3. Commission (read only)
- LIVE: every community has `platform_fee_percent = 0.00` (5 communities).
- LIVE: the database payout trigger `_create_worker_payout_core` reads `communities.platform_fee_percent` each time it runs, so the fee is dynamic and has no 20% hardcoded.
- SOURCE: the edge function `complete-booking-with-otp` also reads it each time it runs.
- Differences between the two (no effect at 0%, matters once a fee is set):
  1. Rounding: the trigger rounds down and the edge function rounds to the nearest rupee, so they can differ by ₹1.
  2. Community match: the trigger matches `value` without case. The edge function matches `value` or `name`, with case.
  3. Payment check: the trigger waits for payment or "Collected". The edge function creates the payout at once, whatever the payment status.
  4. Status label: the trigger writes `created` / `payout_<id>`. The edge function writes `pending` / `booking:<id>`.
  Only one payout per booking is possible either way (unique `booking_id`). The first writer wins.
- NOT VERIFIED: that the Admin Panel's commission screen writes `communities.platform_fee_percent` and not some other setting. Check this in the Admin Panel project.
- Recommendation: pick one payout writer before any fee above 0% is turned on. This is a separate change and was not done here.
- Project memory still says "20% platform fee". At present that is wrong: the fee is 0% and comes from the communities settings.

## 4. Test environment
None exists. Production `paywwbuqycovjopryele` is the only connected database.
Safest method:
1. Create a new, empty Supabase project (or a Supabase branch, on a paid plan).
2. Load the schema only, from `supabase db dump --schema-only` against production. This only reads production and copies no customer data.
3. Add fake workers, customers and bookings.
4. Apply the draft. Run the 15 scenarios plus a real call to `complete-booking-with-otp` deployed to the test project.
Never point tests at production or use live bookings.

## 5. Deployment sequence (after approval)
1. Finish the User App, Admin Panel and cron checks (section 2).
2. Pass all tests on the test copy, including a real end-code completion.
3. Take a production backup snapshot.
4. Apply the draft SQL as one migration during a quiet hour.
5. Right away, complete one test booking with the end code. Confirm exactly one payout. Confirm that a direct worker update is refused.
6. Watch for 24 hours: completions per hour compared with before, and errors with code 42501 in the logs.

## 6. Rollback
- Trigger: legitimate completions fail, or completions drop to 0.
- Action: run the rollback block (seconds, no data change).
- Recovery: re-run `complete-booking-with-otp` for any booking that failed. The function can safely be repeated and restores a missing payout.

## 7. Recommendation
Patch: **ready for isolated testing.** Production: **NO-GO** until the test copy exists, sections 2 and 5.1–5.2 pass, the device test passes, and you give separate approval.
