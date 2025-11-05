-- Update the notify_next_tier_workers function to call the edge function
CREATE OR REPLACE FUNCTION notify_next_tier_workers()
RETURNS trigger AS $$
DECLARE
  v_booking_id uuid;
  v_current_tier int;
  v_next_tier int;
  v_next_tier_count int;
BEGIN
  v_booking_id := OLD.booking_id;
  v_current_tier := OLD.order_sequence;
  v_next_tier := v_current_tier + 1;

  -- Check if booking is still pending
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE id = v_booking_id AND status = 'pending'
  ) THEN
    
    -- Update next tier workers to pending status
    UPDATE booking_requests
    SET status = 'pending',
        offered_at = now(),
        timeout_at = now() + interval '30 seconds'
    WHERE booking_id = v_booking_id
      AND order_sequence = v_next_tier
      AND status = 'queued';
    
    GET DIAGNOSTICS v_next_tier_count = ROW_COUNT;

    IF v_next_tier_count > 0 THEN
      RAISE NOTICE 'Escalating booking % to Tier % (% workers)', v_booking_id, v_next_tier, v_next_tier_count;
      
      -- Call edge function to send notifications (async via pg_net)
      PERFORM
        net.http_post(
          url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/notify-next-tier',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o'
          ),
          body := jsonb_build_object(
            'booking_id', v_booking_id,
            'tier', v_next_tier
          )
        );
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;