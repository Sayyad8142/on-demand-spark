-- Create the update_booking_status RPC function
CREATE OR REPLACE FUNCTION public.update_booking_status(
  p_booking_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  -- Get the booking
  SELECT * INTO v_booking 
  FROM public.bookings 
  WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Booking not found'
    );
  END IF;
  
  -- Check if worker is authorized
  IF v_booking.worker_id IS NULL OR v_booking.worker_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authorized to update this booking'
    );
  END IF;
  
  -- Update the booking status
  UPDATE public.bookings
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_booking_id;
  
  RETURN jsonb_build_object(
    'success', true
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;