-- DRAFT — NOT APPLIED. Phase 1 critical OTP fix: completion lock.
-- Target: public.bookings (production paywwbuqycovjopryele). Requires separate approval.
--
-- Rule: only trusted callers may move a booking into 'completed' or touch the
-- completion evidence columns. Trusted = service_role (complete-booking-with-otp
-- edge function), database owner/maintenance roles, or is_admin() (admin RPCs /
-- Admin Panel). Everyone else (assigned worker, customer, anon) is refused,
-- regardless of which labels they write.

CREATE OR REPLACE FUNCTION public._is_trusted_completion_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- PostgREST request role (new + legacy claim settings)
    COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      NULLIF(current_setting('request.jwt.claim.role', true), '')
    ) = 'service_role'
    -- direct DB sessions (migrations, cron SQL, dashboard) — no JWT at all
    OR (
      NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
      AND NULLIF(current_setting('request.jwt.claim.role', true), '') IS NULL
      AND session_user IN ('postgres', 'supabase_admin')
    )
    OR COALESCE(public.is_admin(), false);
$$;

REVOKE ALL ON FUNCTION public._is_trusted_completion_caller() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_booking_completion_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trusted boolean := public._is_trusted_completion_caller();
  v_admin   boolean := COALESCE(public.is_admin(), false);
BEGIN
  IF v_trusted THEN
    -- Audit every admin (non-service) completion.
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND v_admin
       AND COALESCE(
             NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
             NULLIF(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' THEN
      INSERT INTO public.booking_events (booking_id, type, meta)
      VALUES (NEW.id, 'admin_completion', jsonb_build_object(
        'admin_uid', auth.uid(),
        'completion_source', NEW.completion_source,
        'completed_by', NEW.completed_by,
        'from_status', OLD.status));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Booking can only be completed through End OTP verification'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completion_source IS DISTINCT FROM OLD.completion_source
     OR NEW.completed_by    IS DISTINCT FROM OLD.completed_by
     OR NEW.otp_verified_at IS DISTINCT FROM OLD.otp_verified_at
     OR NEW.completed_at    IS DISTINCT FROM OLD.completed_at
     OR NEW.completion_otp  IS DISTINCT FROM OLD.completion_otp THEN
    RAISE EXCEPTION 'Completion fields are server-managed'
      USING ERRCODE = '42501';
  END IF;

  -- Do not let a completed booking be re-opened (would allow a second completion).
  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Completed bookings cannot be re-opened' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_booking_completion_lock() FROM PUBLIC, anon, authenticated;

-- Name sorts before the payout AFTER triggers are irrelevant (BEFORE always runs first);
-- 'aaa1_' keeps it ahead of other BEFORE triggers so nothing else runs on a refused row.
DROP TRIGGER IF EXISTS aaa1_guard_booking_completion_lock ON public.bookings;
CREATE TRIGGER aaa1_guard_booking_completion_lock
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_completion_lock();

-- Legacy RPC: update_booking_status lets the assigned worker pick ANY status
-- (including 'completed'). The lock trigger above already refuses that, but close
-- the door explicitly too. Live grant is already NOT executable by authenticated
-- (LIVE-READ 18 Oct) — kept here as defence in depth.
REVOKE EXECUTE ON FUNCTION public.update_booking_status(uuid, text) FROM PUBLIC, anon, authenticated;

-- ROLLBACK (single statement block):
--   DROP TRIGGER IF EXISTS aaa1_guard_booking_completion_lock ON public.bookings;
--   DROP FUNCTION IF EXISTS public.guard_booking_completion_lock();
--   DROP FUNCTION IF EXISTS public._is_trusted_completion_caller();
--   (update_booking_status grant: leave revoked; it was not executable before.)
