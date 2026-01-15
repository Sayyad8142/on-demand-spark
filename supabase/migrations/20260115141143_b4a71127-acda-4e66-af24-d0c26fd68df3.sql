-- Drop and recreate the function with updated 20-minute lock
DROP FUNCTION IF EXISTS public.worker_set_booking_status(uuid, text);

CREATE OR REPLACE FUNCTION public.worker_set_booking_status(p_booking_id uuid, p_new_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_worker_id uuid;
  v_accepted_at timestamptz;
  v_lock_minutes int := 20; -- Changed from 30 to 20 minutes
  v_unlock_time timestamptz;
  v_remaining_seconds int;
BEGIN
  -- Get current booking info
  SELECT status, worker_id, accepted_at
  INTO v_current_status, v_worker_id, v_accepted_at
  FROM bookings
  WHERE id = p_booking_id;

  -- Check if booking exists
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  -- Check if worker owns this booking
  IF v_worker_id IS NULL OR v_worker_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Check completion lock (20 minutes from accepted_at)
  IF p_new_status = 'completed' AND v_accepted_at IS NOT NULL THEN
    v_unlock_time := v_accepted_at + (v_lock_minutes || ' minutes')::interval;
    
    IF now() < v_unlock_time THEN
      v_remaining_seconds := EXTRACT(EPOCH FROM (v_unlock_time - now()))::int;
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Work can be completed only after ' || v_lock_minutes || ' minutes',
        'error_code', 'COMPLETION_LOCKED',
        'remaining_seconds', v_remaining_seconds
      );
    END IF;
  END IF;

  -- Update the booking status
  UPDATE bookings
  SET 
    status = p_new_status,
    updated_at = now(),
    completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;