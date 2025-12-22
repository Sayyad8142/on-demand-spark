-- Fix try_accept_booking worker lookup for legacy rows (user_id NULL)
-- The auth user id (auth.uid()) is a UUID. Some worker records store this in workers.id (legacy),
-- while newer ones store it in workers.user_id (text/uuid-as-text). Support both.

CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking bookings;
  v_worker workers;
  v_auth_uid uuid := auth.uid();
BEGIN
  -- Check authentication
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get worker details (support both schemas)
  SELECT *
  INTO v_worker
  FROM public.workers
  WHERE (public.workers.user_id::text = v_auth_uid::text OR public.workers.id = v_auth_uid)
  LIMIT 1;

  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker not found');
  END IF;

  IF NOT v_worker.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your account is not active');
  END IF;

  IF NOT COALESCE(v_worker.is_available, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not available');
  END IF;

  -- Lock and get booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking already taken');
  END IF;

  -- Check eligibility
  IF NOT (v_booking.service_type = ANY(v_worker.service_types)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service type mismatch');
  END IF;

  IF NOT (v_booking.community = ANY(v_worker.communities) OR v_booking.community = v_worker.community) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Community mismatch');
  END IF;

  -- Accept booking
  UPDATE public.bookings
  SET status = 'assigned',
      worker_id = v_worker.id,
      worker_name = v_worker.full_name,
      worker_phone = v_worker.phone,
      worker_upi = v_worker.upi_id,
      worker_photo_url = v_worker.photo_url,
      assigned_at = now(),
      accepted_at = now(),
      confirmed_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;

  -- Mark worker as busy
  UPDATE public.workers
  SET is_busy = true,
      updated_at = now()
  WHERE id = v_worker.id;

  -- Log event
  INSERT INTO public.booking_events (booking_id, type, meta)
  VALUES (p_booking_id, 'accepted', jsonb_build_object('worker_id', v_worker.id, 'worker_name', v_worker.full_name));

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;
