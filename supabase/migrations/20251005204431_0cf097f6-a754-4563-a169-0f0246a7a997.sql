-- Create trigger to invoke booking-notifications edge function when booking is created
CREATE OR REPLACE FUNCTION notify_new_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify for new pending bookings
  IF NEW.status = 'pending' THEN
    -- Call the edge function asynchronously via pg_net (if available) or supabase_functions
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/booking-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object('booking_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS trigger_notify_new_booking ON bookings;
CREATE TRIGGER trigger_notify_new_booking
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_booking();