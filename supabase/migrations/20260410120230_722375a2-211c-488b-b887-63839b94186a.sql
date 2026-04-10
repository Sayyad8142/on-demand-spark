
-- 1. Create secure RPC for worker payment collection
CREATE OR REPLACE FUNCTION public.worker_collect_payment(
  p_booking_id uuid,
  p_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_booking record;
BEGIN
  -- Validate method
  IF p_method NOT IN ('cash', 'upi') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid collection method');
  END IF;

  -- Resolve worker from auth
  SELECT id INTO v_worker_id
  FROM workers
  WHERE user_id = auth.uid()::text
  LIMIT 1;

  IF v_worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker not found');
  END IF;

  -- Fetch booking and validate ownership + status
  SELECT id, worker_id, status, worker_collected_payment
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.worker_id != v_worker_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your booking');
  END IF;

  IF v_booking.status NOT IN ('assigned', 'accepted', 'on_the_way', 'started') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not in active state');
  END IF;

  IF v_booking.worker_collected_payment = true THEN
    RETURN jsonb_build_object('success', true, 'already_collected', true);
  END IF;

  -- Perform the safe update
  UPDATE bookings
  SET worker_collected_payment = true,
      worker_collection_method = p_method,
      worker_collected_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Create trigger to block sensitive field changes by workers
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

  -- Check if caller is the assigned worker
  IF EXISTS (
    SELECT 1 FROM workers w
    WHERE w.id = OLD.worker_id
      AND w.user_id = auth.uid()::text
  ) THEN
    -- Worker detected: block sensitive field changes
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
    IF NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
      RAISE EXCEPTION 'Workers cannot modify worker_id';
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
      RAISE EXCEPTION 'Workers cannot modify cancel_source';
    END IF;
    IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      RAISE EXCEPTION 'Workers cannot modify cancelled_at';
    END IF;
    IF NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id THEN
      RAISE EXCEPTION 'Workers cannot modify razorpay_order_id';
    END IF;
    IF NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id THEN
      RAISE EXCEPTION 'Workers cannot modify razorpay_payment_id';
    END IF;
    IF NEW.razorpay_signature IS DISTINCT FROM OLD.razorpay_signature THEN
      RAISE EXCEPTION 'Workers cannot modify razorpay_signature';
    END IF;
    IF NEW.completion_otp IS DISTINCT FROM OLD.completion_otp THEN
      RAISE EXCEPTION 'Workers cannot modify completion_otp';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Workers cannot modify status directly — use RPCs';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists to avoid duplicate
DROP TRIGGER IF EXISTS trg_guard_booking_sensitive_fields ON bookings;

CREATE TRIGGER trg_guard_booking_sensitive_fields
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION guard_booking_sensitive_fields();
