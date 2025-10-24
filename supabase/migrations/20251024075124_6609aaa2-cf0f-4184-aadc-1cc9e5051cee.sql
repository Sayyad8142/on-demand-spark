-- Fix try_accept_booking to check both id and user_id for worker lookup
CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking bookings;
  v_worker workers;
  v_auth_id uuid := auth.uid();
BEGIN
  -- Check authentication
  IF v_auth_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get worker details - check both id and user_id
  SELECT * INTO v_worker FROM workers 
  WHERE id = v_auth_id OR user_id = v_auth_id
  LIMIT 1;
  
  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker not found');
  END IF;
  
  IF NOT v_worker.is_active OR NOT v_worker.is_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not available');
  END IF;

  -- Lock and get booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;
  
  IF v_booking.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking already taken');
  END IF;
  
  -- Check if worker is eligible (matches service type and community)
  IF NOT (v_booking.service_type = ANY(v_worker.service_types)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service type mismatch');
  END IF;
  
  IF NOT (v_booking.community = ANY(v_worker.communities) OR v_booking.community = v_worker.community) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Community mismatch');
  END IF;
  
  -- Accept booking
  UPDATE bookings
  SET status = 'assigned',
      worker_id = v_worker.id,
      worker_name = v_worker.full_name,
      worker_phone = v_worker.phone,
      worker_upi = v_worker.upi_id,
      worker_photo_url = v_worker.photo_url,
      assigned_at = now(),
      confirmed_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;
  
  -- Mark worker as busy
  UPDATE workers SET is_busy = true WHERE id = v_worker.id;
  
  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$function$;