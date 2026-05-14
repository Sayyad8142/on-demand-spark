CREATE OR REPLACE FUNCTION public.guard_booking_completion_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed' THEN

    IF COALESCE(NEW.completion_source, '') NOT IN ('otp', 'admin') THEN
      RAISE EXCEPTION 'Booking completion must use OTP or admin completion flow'
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(NEW.completed_by, '') NOT IN ('worker', 'admin') THEN
      RAISE EXCEPTION 'Booking completion must record completed_by as worker or admin'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.completion_source = 'otp' THEN
      IF NEW.completed_by <> 'worker' THEN
        RAISE EXCEPTION 'OTP completion must be completed_by worker'
          USING ERRCODE = '23514';
      END IF;

      IF NEW.otp_verified_at IS NULL THEN
        RAISE EXCEPTION 'OTP completion requires otp_verified_at'
          USING ERRCODE = '23514';
      END IF;
      -- Payment validation removed: platform is now online-payment only and
      -- payment reconciliation happens out-of-band. OTP entry by the worker
      -- is the source of truth for service delivery.
    END IF;

    IF NEW.completion_source = 'admin' AND NEW.completed_by <> 'admin' THEN
      RAISE EXCEPTION 'Admin completion must be completed_by admin'
        USING ERRCODE = '23514';
    END IF;

    NEW.completed_at := COALESCE(NEW.completed_at, now());
  END IF;

  RETURN NEW;
END;
$function$;