-- Drop the previous function
DROP FUNCTION IF EXISTS reject_booking_and_notify_next;

-- Simpler function to handle worker rejection
CREATE OR REPLACE FUNCTION reject_booking_request(
  p_booking_id uuid,
  p_worker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_tier integer;
  v_next_tier integer;
  v_booking_status text;
  v_total_in_tier integer;
  v_responded_in_tier integer;
  v_next_tier_workers uuid[];
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

  -- If all workers in current tier have responded, activate next tier
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
        AND status = 'pending'
      RETURNING worker_id INTO v_next_tier_workers;

      RETURN jsonb_build_object(
        'success', true, 
        'message', 'rejected-next-tier-activated',
        'current_tier', v_current_tier,
        'next_tier', v_next_tier,
        'should_notify', true
      );
    ELSE
      -- No more tiers available, booking remains pending
      RETURN jsonb_build_object(
        'success', true,
        'message', 'rejected-no-more-tiers',
        'current_tier', v_current_tier,
        'should_notify', false
      );
    END IF;
  ELSE
    -- Still waiting for other workers in current tier
    RETURN jsonb_build_object(
      'success', true,
      'message', 'rejected-waiting-for-tier',
      'current_tier', v_current_tier,
      'responded', v_responded_in_tier,
      'total', v_total_in_tier,
      'should_notify', false
    );
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION reject_booking_request TO authenticated;