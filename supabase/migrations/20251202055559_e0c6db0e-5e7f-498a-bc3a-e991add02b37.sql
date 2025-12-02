-- Function to handle worker rejection and notify next tier
CREATE OR REPLACE FUNCTION reject_booking_and_notify_next(
  p_booking_id uuid,
  p_worker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_tier integer;
  v_next_tier integer;
  v_booking_status text;
  v_all_rejected boolean;
  v_total_in_tier integer;
  v_responded_in_tier integer;
BEGIN
  -- Check booking status
  SELECT status INTO v_booking_status
  FROM bookings
  WHERE id = p_booking_id;

  IF v_booking_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking-not-found');
  END IF;

  IF v_booking_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking-already-accepted');
  END IF;

  -- Update booking_requests to mark as rejected
  UPDATE booking_requests
  SET status = 'rejected',
      responded_at = now()
  WHERE booking_id = p_booking_id
    AND worker_id = p_worker_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request-not-found');
  END IF;

  -- Get the tier of the rejected request
  SELECT order_sequence INTO v_current_tier
  FROM booking_requests
  WHERE booking_id = p_booking_id
    AND worker_id = p_worker_id
  LIMIT 1;

  -- Count total workers in current tier and how many have responded
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status IN ('rejected', 'accepted', 'timeout')) as responded
  INTO v_total_in_tier, v_responded_in_tier
  FROM booking_requests
  WHERE booking_id = p_booking_id
    AND order_sequence = v_current_tier;

  -- If all workers in current tier have responded, notify next tier
  IF v_responded_in_tier >= v_total_in_tier THEN
    -- Find next tier
    SELECT MIN(order_sequence) INTO v_next_tier
    FROM booking_requests
    WHERE booking_id = p_booking_id
      AND order_sequence > v_current_tier
      AND status = 'pending';

    IF v_next_tier IS NOT NULL THEN
      -- Update next tier with offered_at and timeout_at
      UPDATE booking_requests
      SET offered_at = now(),
          timeout_at = now() + interval '30 seconds'
      WHERE booking_id = p_booking_id
        AND order_sequence = v_next_tier
        AND status = 'pending';

      -- Call notify-next-tier edge function asynchronously
      PERFORM net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/notify-next-tier',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
        ),
        body := jsonb_build_object(
          'booking_id', p_booking_id,
          'tier', v_next_tier
        )
      );

      RETURN jsonb_build_object(
        'success', true, 
        'message', 'rejected-notifying-next-tier',
        'current_tier', v_current_tier,
        'next_tier', v_next_tier
      );
    ELSE
      -- No more tiers available, booking remains pending
      RETURN jsonb_build_object(
        'success', true,
        'message', 'rejected-no-more-tiers',
        'current_tier', v_current_tier
      );
    END IF;
  ELSE
    -- Still waiting for other workers in current tier
    RETURN jsonb_build_object(
      'success', true,
      'message', 'rejected-waiting-for-tier',
      'current_tier', v_current_tier,
      'responded', v_responded_in_tier,
      'total', v_total_in_tier
    );
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION reject_booking_and_notify_next TO authenticated;