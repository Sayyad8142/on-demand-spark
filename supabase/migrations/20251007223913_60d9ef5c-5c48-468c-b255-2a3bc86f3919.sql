-- Drop existing function first
DROP FUNCTION IF EXISTS public.try_accept_booking(uuid);

-- Create try_accept_booking RPC for workers to accept bookings
CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking bookings;
  v_worker workers;
BEGIN
  -- Get worker details
  SELECT * INTO v_worker FROM workers WHERE id = auth.uid();
  
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
$$;

-- Create DB trigger to call booking-notifications edge function on new pending bookings
CREATE OR REPLACE FUNCTION public.trigger_booking_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger for new bookings with 'pending' status
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    -- Call the edge function asynchronously via pg_net
    PERFORM
      net.http_post(
        url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/booking-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o'
        ),
        body := jsonb_build_object('booking_id', NEW.id)
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_booking_created_notify_workers ON bookings;

-- Create the trigger
CREATE TRIGGER on_booking_created_notify_workers
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_booking_notification();