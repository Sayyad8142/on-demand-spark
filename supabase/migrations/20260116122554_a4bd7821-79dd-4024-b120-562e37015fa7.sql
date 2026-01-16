
CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings;
  v_worker workers;
  v_auth_uid uuid := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

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

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  -- If booking is already assigned to THIS worker, return success (idempotent accept)
  IF v_booking.worker_id = v_worker.id AND v_booking.status IN ('assigned', 'accepted', 'on_the_way', 'started') THEN
    RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'already_assigned', true);
  END IF;

  IF v_booking.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking already taken');
  END IF;

  IF NOT (v_booking.service_type = ANY(v_worker.service_types)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service type mismatch');
  END IF;

  IF NOT (v_booking.community = ANY(v_worker.communities) OR v_booking.community = v_worker.community) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Community mismatch');
  END IF;

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

  UPDATE public.workers
  SET is_busy = true,
      updated_at = now()
  WHERE id = v_worker.id;

  INSERT INTO public.booking_events (booking_id, type, meta)
  VALUES (p_booking_id, 'accepted', jsonb_build_object('worker_id', v_worker.id, 'worker_name', v_worker.full_name));

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;
