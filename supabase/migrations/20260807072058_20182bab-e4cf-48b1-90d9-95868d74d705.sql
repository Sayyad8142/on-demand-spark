CREATE OR REPLACE FUNCTION public.guard_booking_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role and admin users to change anything
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- 1. Handling worker_id modification:
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    -- If OLD.worker_id was already set, block modification by any non-admin
    IF OLD.worker_id IS NOT NULL THEN
       RAISE EXCEPTION 'Users cannot modify worker_id (already assigned)';
    END IF;

    -- If OLD.worker_id was NULL, this is an assignment.
    -- Ensure the worker_id being set belongs to the authenticated user.
    -- (This also protects against manual client-side injection).
    IF NOT EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = NEW.worker_id
        AND w.user_id = auth.uid()::text
    ) THEN
       RAISE EXCEPTION 'Users cannot modify worker_id (unauthorized identity)';
    END IF;
  END IF;

  -- 2. Handling other sensitive fields (only for the already assigned worker):
  IF OLD.worker_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = OLD.worker_id
      AND w.user_id = auth.uid()::text
  ) THEN
    -- Block standard sensitive fields
    IF NEW.price_inr IS DISTINCT FROM OLD.price_inr THEN
      RAISE EXCEPTION 'Workers cannot modify price_inr';
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Workers cannot modify payment_status';
    END IF;
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'Workers cannot modify payment_method';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Workers cannot modify user_id';
    END IF;
    IF NEW.service_type IS DISTINCT FROM OLD.service_type THEN
      RAISE EXCEPTION 'Workers cannot modify service_type';
    END IF;
    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
      RAISE EXCEPTION 'Workers cannot modify scheduled_date';
    END IF;
    IF NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
      RAISE EXCEPTION 'Workers cannot modify scheduled_time';
    END IF;
    IF NEW.payout_amount IS DISTINCT FROM OLD.payout_amount THEN
      RAISE EXCEPTION 'Workers cannot modify payout_amount';
    END IF;
    IF NEW.discount_inr IS DISTINCT FROM OLD.discount_inr THEN
      RAISE EXCEPTION 'Workers cannot modify discount_inr';
    END IF;
    IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
      RAISE EXCEPTION 'Workers cannot modify cancel_reason';
    END IF;
    IF NEW.cancel_source IS DISTINCT FROM OLD.cancel_source THEN
      RAISE EXCEPTION 'Users cannot modify cancel_source';
    END IF;
    IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      RAISE EXCEPTION 'Users cannot modify cancelled_at';
    END IF;
    IF NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id THEN
      RAISE EXCEPTION 'Users cannot modify razorpay_order_id';
    END IF;
    IF NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id THEN
      RAISE EXCEPTION 'Users cannot modify razorpay_payment_id';
    END IF;
    IF NEW.razorpay_signature IS DISTINCT FROM OLD.razorpay_signature THEN
      RAISE EXCEPTION 'Users cannot modify razorpay_signature';
    END IF;
    IF NEW.completion_otp IS DISTINCT FROM OLD.completion_otp THEN
      RAISE EXCEPTION 'Users cannot modify completion_otp';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;