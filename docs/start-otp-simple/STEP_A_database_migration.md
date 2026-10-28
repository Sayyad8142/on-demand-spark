# Simple Start OTP — Step A: Database migration (PREPARED, NOT EXECUTED)

Status: PROPOSED. Nothing in this file has been run against production.
Labels: LIVE = read-only check on `paywwbuqycovjopryele` (28 Oct 2026), PROPOSED = not run.

## What LIVE checks found (relevant to Step A)

- LIVE: End code is created only by `trg_enforce_server_completion_otp` (BEFORE INSERT),
  `lpad(floor(random()*10000)...)` into `bookings.completion_otp`. Unchanged by this plan.
- LIVE: `guard_booking_completion_source` (BEFORE UPDATE OF status) requires
  `completion_source in (otp, admin)` and, for OTP, `otp_verified_at`. It does NOT check that the
  code was actually verified — any writer can set those fields.
- LIVE: Workers have a direct UPDATE policy on their assigned bookings
  (`bookings_worker_update_assigned`); customers have one on their own bookings
  (`bookings_update_own_firebase`). Workers can SELECT every column of assigned bookings.
  => A `start_otp` column on `bookings` would be readable by workers. The code must live in a
  separate table with no client grants.
- LIVE: Status rules already allow assigned/accepted/on_the_way → started → completed. No change needed.
- LIVE: `pgcrypto` is installed in schema `extensions` (secure random available).
- NOT VERIFIED: deployed source of `complete-booking-with-otp` (only the repo copy was read; it
  reads `completion_otp` and writes status `completed` with `completion_source='otp'`). Step A only
  adds a database rule, so the deployed function needs no change, but its exact behaviour must be
  exported and checked before Step F.

## Design (smallest safe version)

1. New table `booking_start_otps` (one row per booking): code, attempts, lock, worker it was issued
   for. No grants to `anon`/`authenticated` — only security-definer functions touch it.
2. New column `bookings.start_otp_required boolean default false` — non-secret flag the Worker App
   and User App can read to know which flow a booking uses. Clients cannot change it.
3. Master switch `ops_settings`-style row is NOT used; instead a dedicated one-row table
   `start_otp_config(enabled boolean default false)`. While false, new bookings get no Start code
   and behave exactly as today. **Existing bookings are never touched.**
4. Code is issued when a worker is assigned (and re-issued on reassignment), only if the booking
   has `start_otp_required = true`.
5. `started` can only be set on a Start-OTP booking inside `verify_start_otp` (transaction-local flag).
6. OTP completion of a Start-OTP booking is refused unless it is already `started`. Admin completion
   stays allowed (existing admin tools keep working).

## Files

- Migration (via the migration tool only, after approval) — SQL below.
- No edge function changes in Step A. No Worker App / User App changes in Step A.

## SQL (PROPOSED)

```sql
-- 1. Config switch (default OFF)
CREATE TABLE public.start_otp_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  max_attempts int NOT NULL DEFAULT 5,
  min_seconds_between_attempts int NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.start_otp_config (id) VALUES (true);
GRANT SELECT ON public.start_otp_config TO authenticated;
GRANT ALL ON public.start_otp_config TO service_role;
ALTER TABLE public.start_otp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read start otp config"
  ON public.start_otp_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can change start otp config"
  ON public.start_otp_config FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT UPDATE ON public.start_otp_config TO authenticated;

-- 2. Secret table (no client access at all)
CREATE TABLE public.booking_start_otps (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  code text NOT NULL,
  issued_for_worker_id uuid,
  attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  locked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.booking_start_otps TO service_role;
ALTER TABLE public.booking_start_otps ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated on purpose.

-- 3. Non-secret flag on bookings
ALTER TABLE public.bookings
  ADD COLUMN start_otp_required boolean NOT NULL DEFAULT false;

-- 4. Secure 4-digit generator (not random())
CREATE OR REPLACE FUNCTION public._gen_start_otp()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 10000)::text, 4, '0')
$$;
REVOKE ALL ON FUNCTION public._gen_start_otp() FROM PUBLIC, anon, authenticated;

-- 5. Flag protection + issue/re-issue on assignment
CREATE OR REPLACE FUNCTION public.start_otp_bookings_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Client input ignored; only the master switch decides.
    NEW.start_otp_required := COALESCE((SELECT enabled FROM public.start_otp_config), false);
    RETURN NEW;
  END IF;

  -- Nobody may flip the flag after creation.
  NEW.start_otp_required := OLD.start_otp_required;

  IF NOT OLD.start_otp_required THEN
    RETURN NEW;   -- legacy booking: no further rules
  END IF;

  -- Only verify_start_otp may move a Start-OTP booking to 'started'.
  IF NEW.status = 'started' AND OLD.status IS DISTINCT FROM 'started'
     AND COALESCE(current_setting('app.start_otp_ok', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'Start code required' USING ERRCODE = '23514';
  END IF;

  -- OTP completion requires a verified start. Admin completion still allowed.
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND COALESCE(NEW.completion_source, '') <> 'admin'
     AND OLD.status IS DISTINCT FROM 'started' THEN
    RAISE EXCEPTION 'Booking must be started with the Start code first' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER aab_start_otp_bookings_guard
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.start_otp_bookings_guard();

CREATE OR REPLACE FUNCTION public.start_otp_issue_on_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.start_otp_required THEN RETURN NEW; END IF;
  IF NEW.status IN ('started', 'completed', 'cancelled') THEN RETURN NEW; END IF;

  IF NEW.worker_id IS NULL THEN
    DELETE FROM public.booking_start_otps WHERE booking_id = NEW.id;   -- unassigned: old code dead
  ELSIF TG_OP = 'INSERT' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    INSERT INTO public.booking_start_otps (booking_id, code, issued_for_worker_id)
    VALUES (NEW.id, public._gen_start_otp(), NEW.worker_id)
    ON CONFLICT (booking_id) DO UPDATE
      SET code = EXCLUDED.code, issued_for_worker_id = EXCLUDED.issued_for_worker_id,
          attempts = 0, last_attempt_at = NULL, locked_at = NULL, verified_at = NULL,
          updated_at = now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zza_start_otp_issue_on_assign
  AFTER INSERT OR UPDATE OF worker_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.start_otp_issue_on_assign();

-- 6. Worker verification (worker taken from the session; never returns the code)
CREATE OR REPLACE FUNCTION public.verify_start_otp(p_booking_id uuid, p_otp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_worker uuid;
  b record; o record; c record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); END IF;
  IF p_otp IS NULL OR p_otp !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_FORMAT');
  END IF;
  SELECT id INTO v_worker FROM public.workers WHERE id = v_uid OR user_id = v_uid::text LIMIT 1;
  IF v_worker IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'BOOKING_NOT_FOUND'); END IF;
  IF b.worker_id IS DISTINCT FROM v_worker THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_ASSIGNED'); END IF;
  IF NOT b.start_otp_required THEN
    RETURN jsonb_build_object('success', false, 'code', 'LEGACY_BOOKING'); END IF;
  IF b.status = 'started' THEN RETURN jsonb_build_object('success', true, 'already_started', true); END IF;
  IF b.status NOT IN ('assigned', 'accepted', 'on_the_way') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS'); END IF;

  SELECT * INTO c FROM public.start_otp_config;
  SELECT * INTO o FROM public.booking_start_otps WHERE booking_id = b.id FOR UPDATE;
  IF NOT FOUND OR o.issued_for_worker_id IS DISTINCT FROM v_worker THEN
    RETURN jsonb_build_object('success', false, 'code', 'CODE_UNAVAILABLE'); END IF;
  IF o.locked_at IS NOT NULL OR o.attempts >= c.max_attempts THEN
    RETURN jsonb_build_object('success', false, 'code', 'LOCKED'); END IF;
  IF o.last_attempt_at IS NOT NULL
     AND o.last_attempt_at > now() - make_interval(secs => c.min_seconds_between_attempts) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOO_FAST'); END IF;

  IF o.code <> p_otp THEN
    UPDATE public.booking_start_otps
       SET attempts = attempts + 1, last_attempt_at = now(),
           locked_at = CASE WHEN attempts + 1 >= c.max_attempts THEN now() END, updated_at = now()
     WHERE booking_id = b.id;
    RETURN jsonb_build_object('success', false, 'code',
      CASE WHEN o.attempts + 1 >= c.max_attempts THEN 'LOCKED' ELSE 'WRONG_CODE' END,
      'attempts_left', GREATEST(c.max_attempts - o.attempts - 1, 0));
  END IF;

  PERFORM set_config('app.start_otp_ok', b.id::text, true);
  UPDATE public.bookings SET status = 'started', started_at = COALESCE(started_at, now()), updated_at = now()
   WHERE id = b.id;
  PERFORM set_config('app.start_otp_ok', '', true);
  UPDATE public.booking_start_otps SET verified_at = now(), last_attempt_at = now(), updated_at = now()
   WHERE booking_id = b.id;
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.verify_start_otp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_start_otp(uuid, text) TO authenticated;

-- 7. Customer retrieval (only the booking's own customer, only before start)
CREATE OR REPLACE FUNCTION public.get_my_start_otp(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; v_code text;
BEGIN
  SELECT id, user_id, status, start_otp_required, worker_id INTO b
    FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.user_id IS DISTINCT FROM public.get_profile_id() THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  IF NOT b.start_otp_required THEN RETURN jsonb_build_object('success', true, 'required', false); END IF;
  IF b.status NOT IN ('assigned', 'accepted', 'on_the_way') THEN
    RETURN jsonb_build_object('success', true, 'required', true, 'start_otp', NULL, 'status', b.status); END IF;
  SELECT code INTO v_code FROM public.booking_start_otps
   WHERE booking_id = b.id AND issued_for_worker_id = b.worker_id;
  RETURN jsonb_build_object('success', true, 'required', true, 'start_otp', v_code);
END $$;
REVOKE ALL ON FUNCTION public.get_my_start_otp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_start_otp(uuid) TO authenticated;
```

Notes:
- `get_profile_id()` is what the live customer policy uses; must confirm it is the same customer
  identity the User App session has (User App backend NOT VERIFIED).
- Worker verification is a database function, so no new server deployment is strictly required.
  If the Worker App must keep calling `verify-start-otp`, Step B adds a thin wrapper that only
  forwards the worker's own token to this function.
- Customer UPDATE policy cannot set `started`: the guard needs the transaction flag that only
  `verify_start_otp` sets.

## Risks

| Risk | Mitigation |
|---|---|
| New trigger raises on a legacy booking | Guard returns early when `start_otp_required = false` (all existing + all new while switch OFF). |
| Code issued before User App shows it | Switch stays OFF until Steps C–E pass. |
| Admin "complete" tools blocked | Admin completion (`completion_source='admin'`) is exempt. |
| `complete-booking-with-otp` (deployed) does a status write that now fails for unstarted Start-OTP bookings | Intended. Worker sees an error; only affects Start-OTP bookings. Deployed source must be checked before Step F. |
| Reassignment back to `pending` then new worker | `worker_id` change re-issues code and resets attempts; NULL deletes it. |
| Trigger ordering with `aaa_guard_scheduled_booking_assignment_window` (clears worker_id) | Issue trigger is AFTER, so it sees the final `worker_id`. |
| Locked booking | Admin can reassign (re-issues) or complete as admin. A small admin "reset code" function can be added in Step B. |
| Customer UPDATE policy lets a customer change `worker_id` | Pre-existing issue, not introduced here; noted for the security backlog. |

## Rollback

All additive; switch OFF means no behaviour change. Full rollback:

```sql
DROP TRIGGER IF EXISTS zza_start_otp_issue_on_assign ON public.bookings;
DROP TRIGGER IF EXISTS aab_start_otp_bookings_guard ON public.bookings;
DROP FUNCTION IF EXISTS public.get_my_start_otp(uuid);
DROP FUNCTION IF EXISTS public.verify_start_otp(uuid, text);
DROP FUNCTION IF EXISTS public.start_otp_issue_on_assign();
DROP FUNCTION IF EXISTS public.start_otp_bookings_guard();
DROP FUNCTION IF EXISTS public._gen_start_otp();
DROP TABLE IF EXISTS public.booking_start_otps;
DROP TABLE IF EXISTS public.start_otp_config;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS start_otp_required;
```

Soft rollback (no drops): `UPDATE start_otp_config SET enabled = false;` — new bookings return to
legacy. Bookings already created as Start-OTP stay so; admin can complete them as admin.

## Post-migration checks (read-only, before Step B)
- Count of bookings with `start_otp_required = true` is 0.
- `booking_start_otps` row count is 0.
- As a worker session: `select * from booking_start_otps` returns permission denied.
- A legacy test booking still completes via End OTP.
