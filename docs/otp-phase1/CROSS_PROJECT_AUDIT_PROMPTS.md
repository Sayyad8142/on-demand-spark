# Phase 1 — Cross-project audit prompts (ready to paste)
Each prompt is self-contained. Paste it into the chat of the named project. All are read-only.

Shared background (already inside each prompt): the planned Phase 1 patch adds a BEFORE UPDATE trigger on `public.bookings` (`aaa1_guard_booking_completion_lock`). Unless the caller is service_role, a direct DB session (postgres/supabase_admin, no JWT), or passes `public.is_admin()`, it refuses (error 42501): moving a booking into `completed`; changing `completion_source`, `completed_by`, `otp_verified_at`, `completed_at` or `completion_otp`; re-opening a completed booking. Supabase project: `paywwbuqycovjopryele`.

---

## Prompt 1 — Target: Didi Now **User App** (customer app)

```
DIDI NOW — PHASE 1 OTP PATCH: USER APP AUDIT (READ ONLY)
Target project: Didi Now User App (customer app). Shared Supabase: paywwbuqycovjopryele.

Context: a planned database trigger will refuse any non-admin, non-service_role update that
(a) sets bookings.status = 'completed', (b) changes completion_source, completed_by,
otp_verified_at, completed_at or completion_otp, or (c) re-opens a completed booking.

Do NOT change code, database, bookings, or deploy/publish. Report only.

1. Booking permissions: list every place the app writes to `bookings` (direct
   .from("bookings").update/insert/upsert, RPCs, edge functions). For each: file:line,
   columns written, which session it runs as (customer JWT / anon / service_role).
2. OTP visibility: where the customer sees the End (completion) OTP and Start OTP. Which
   query/RPC reads it, and is it limited to the customer's own booking?
3. OTP modification risk: does any code path write or regenerate `completion_otp` or a start
   code as the customer? Who generates the OTP today (DB default, trigger, edge function)?
4. Unauthorized completion: can any customer action (cancel, rate, tip, pay, "mark done",
   dispute) set status 'completed' or the completion fields above?
5. Re-open: does any flow move a completed booking back to another status?
6. Compatibility verdict: list every path that WOULD START FAILING under the trigger,
   and whether that failure is intended (customer should never do it) or a regression.

Output: table (path | file:line | columns | session | affected yes/no | intended?),
then GO / NO-GO for the User App with the Phase 1 patch.
```

---

## Prompt 2 — Target: Didi Now **Admin Panel**

```
DIDI NOW — PHASE 1 OTP PATCH: ADMIN PANEL AUDIT (READ ONLY)
Target project: Didi Now Admin Panel. Shared Supabase: paywwbuqycovjopryele.

Context: a planned trigger allows booking completion / completion-field changes / re-opening
completed bookings ONLY for service_role, direct DB sessions, or callers where
public.is_admin() is true. Admin completions (non-service_role) are logged to
booking_events as type 'admin_completion' with the admin uid.

Do NOT change code, database, bookings, payouts, commission, or deploy/publish. Report only.

1. Admin completion tools: list every UI action that completes a booking (direct update,
   admin_set_booking_status, admin_complete_booking_with_otp, admin_recreate_cancelled_booking,
   any edge function). file:line, RPC/function, session used.
2. Authorization: for each, confirm the signed-in admin passes public.is_admin() (role stored
   in user_roles with app_role 'admin'), or the call runs as service_role server-side. Flag
   anything relying on client-side checks, localStorage, or hardcoded emails.
3. Audit logging: which actions write booking_events / booking_status_history today, and
   which do not. Note admin_complete_booking_with_otp labels itself completed_by='worker'.
4. Emergency overrides: re-open, force-complete, reassign, cancel-after-complete. Would any
   be refused by the trigger? Is re-opening a completed booking a normal admin action?
5. Booking status changes: every status the panel can set, and from which states.
6. Payout creation: every path that creates/edits worker_payouts (manual payout, retry,
   mark ready, dismiss). Confirm payouts are only created for completed bookings.
7. Commission: confirm the commission screen writes communities.platform_fee_percent (and
   nothing else), and which other code reads it. Do not change any value.

Output: table (action | file:line | function | session | is_admin passes? | audited? |
affected by trigger?), then GO / NO-GO for the Admin Panel with the Phase 1 patch.
```

---

## Prompt 3 — Target: **Shared Supabase backend & scheduled jobs**
(Paste into whichever project owns the edge functions / cron. Run read-only SQL.)

```
DIDI NOW — PHASE 1 OTP PATCH: BACKEND & SCHEDULED JOBS AUDIT (READ ONLY)
Target: shared Supabase backend paywwbuqycovjopryele (edge functions, DB functions,
triggers, pg_cron jobs). Read-only SQL only.

Context: planned trigger aaa1_guard_booking_completion_lock (BEFORE UPDATE on bookings)
refuses completion, completion-field edits and re-opening unless caller is service_role,
a direct DB session with no JWT (session_user postgres/supabase_admin), or is_admin().

Do NOT run migrations, change jobs, bookings or payouts, or deploy. Report only.

1. Automated completion: search all DB functions (pg_get_functiondef) and edge functions for
   status = 'completed' or writes to completion_source/completed_by/otp_verified_at/
   completed_at/completion_otp. For each: who calls it and as which role.
2. Server-side authorization: for every SECURITY DEFINER function above, list grants
   (anon/authenticated/service_role) and internal checks (auth.uid(), is_admin(), has_role).
3. Scheduled functions: list cron.job (jobname, schedule, command). For each that touches
   bookings, state whether it runs as postgres (direct, allowed) or via HTTP to an edge
   function (must use service_role inside).
4. Payout triggers: list triggers on bookings and the functions they call
   (_create_worker_payout_core etc.). Confirm payouts only start from status='completed'
   and are unique per booking_id.
5. Other BEFORE UPDATE triggers on bookings: confirm none needs a non-trusted caller to
   change the locked columns, and note trigger ordering vs 'aaa1_'.
6. Compatibility: list anything that would be refused by the trigger and whether that is
   intended.

Output: table (object | type | role | touches locked columns? | allowed by trigger?),
then GO / NO-GO for backend compatibility with the Phase 1 patch.
```
