
-- Drop existing function first
DROP FUNCTION IF EXISTS public.initiate_booking_assignment(uuid, text, text);

-- Create function to call booking-notifications edge function when a booking is created
CREATE OR REPLACE FUNCTION public.initiate_booking_assignment(
  p_booking_id UUID,
  p_service_type TEXT,
  p_community TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  -- Call the booking-notifications edge function via pg_net
  SELECT net.http_post(
    url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/booking-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o'
    ),
    body := jsonb_build_object(
      'booking_id', p_booking_id
    )
  ) INTO v_request_id;

  -- Log the request
  RAISE NOTICE 'Booking notification triggered for booking %: request_id=%', p_booking_id, v_request_id;

  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'booking_id', p_booking_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Log and return error
  RAISE WARNING 'Failed to trigger booking notification for booking %: %', p_booking_id, SQLERRM;
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'booking_id', p_booking_id
  );
END;
$$;

-- Ensure the trigger exists on bookings table
DROP TRIGGER IF EXISTS on_booking_insert_notify ON public.bookings;

CREATE TRIGGER on_booking_insert_notify
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.trigger_booking_assignment();
