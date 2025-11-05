-- Function to notify next tier of workers when timeout expires
CREATE OR REPLACE FUNCTION notify_next_tier_workers()
RETURNS trigger AS $$
DECLARE
  v_booking_id uuid;
  v_current_tier int;
  v_next_tier int;
  v_next_tier_workers uuid[];
  v_booking_data jsonb;
BEGIN
  -- Get booking_id and current tier from the expired request
  v_booking_id := OLD.booking_id;
  v_current_tier := OLD.order_sequence;
  v_next_tier := v_current_tier + 1;

  -- Check if booking is still pending (not accepted by anyone)
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE id = v_booking_id AND status = 'pending'
  ) THEN
    
    -- Get next tier workers who are queued
    SELECT array_agg(worker_id)
    INTO v_next_tier_workers
    FROM booking_requests
    WHERE booking_id = v_booking_id
      AND order_sequence = v_next_tier
      AND status = 'queued';

    -- If we have next tier workers, update their status and notify them
    IF v_next_tier_workers IS NOT NULL AND array_length(v_next_tier_workers, 1) > 0 THEN
      
      -- Update their status to pending
      UPDATE booking_requests
      SET status = 'pending',
          offered_at = now(),
          timeout_at = now() + interval '30 seconds'
      WHERE booking_id = v_booking_id
        AND order_sequence = v_next_tier
        AND status = 'queued';

      -- Get booking data for notification
      SELECT jsonb_build_object(
        'service_type', service_type,
        'community', community,
        'cust_name', cust_name,
        'flat_no', flat_no,
        'price_inr', price_inr
      )
      INTO v_booking_data
      FROM bookings
      WHERE id = v_booking_id;

      -- Log the tier escalation
      RAISE NOTICE 'Escalating booking % to Tier % (% workers)', v_booking_id, v_next_tier, array_length(v_next_tier_workers, 1);
      
      -- Note: Actual FCM notification would be sent via edge function
      -- For now, this ensures the database state is updated correctly
      -- You could add a call to send-fcm edge function here if needed
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on booking_requests when timeout expires
-- This will run when a booking_request times out
DROP TRIGGER IF EXISTS on_booking_request_timeout ON booking_requests;
CREATE TRIGGER on_booking_request_timeout
  AFTER UPDATE ON booking_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'timeout')
  EXECUTE FUNCTION notify_next_tier_workers();

-- Add a periodic job to check for expired booking requests
-- This requires pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to check for expired requests every 10 seconds
SELECT cron.schedule(
  'check-expired-booking-requests',
  '*/10 * * * * *', -- Every 10 seconds
  $$
  UPDATE booking_requests
  SET status = 'timeout'
  WHERE status = 'pending'
    AND timeout_at < now()
    AND EXISTS (
      SELECT 1 FROM bookings 
      WHERE id = booking_requests.booking_id 
      AND status = 'pending'
    );
  $$
);