-- Live definition as read from production on 2026-10-19 (logic-identical, whitespace condensed). Rollback = run this.
CREATE OR REPLACE FUNCTION public._reject_booking_request_core(p_booking_id uuid, p_worker_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_tier integer;
  v_next_tier integer;
  v_booking_status text;
  v_total_in_tier integer;
  v_responded_in_tier integer;
  v_next_tier_workers uuid[];
BEGIN
  SELECT status INTO v_booking_status FROM bookings WHERE id = p_booking_id;

  IF v_booking_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking-not-found');
  END IF;
  IF v_booking_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking-already-accepted');
  END IF;

  UPDATE booking_requests
  SET status = 'rejected', responded_at = now()
  WHERE booking_id = p_booking_id AND worker_id = p_worker_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request-not-found');
  END IF;

  SELECT order_sequence INTO v_current_tier
  FROM booking_requests
  WHERE booking_id = p_booking_id AND worker_id = p_worker_id
  LIMIT 1;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status IN ('rejected', 'accepted', 'timeout'))
  INTO v_total_in_tier, v_responded_in_tier
  FROM booking_requests
  WHERE booking_id = p_booking_id AND order_sequence = v_current_tier;

  IF v_responded_in_tier >= v_total_in_tier THEN
    SELECT MIN(order_sequence) INTO v_next_tier
    FROM booking_requests
    WHERE booking_id = p_booking_id AND order_sequence > v_current_tier AND status = 'pending';

    IF v_next_tier IS NOT NULL THEN
      UPDATE booking_requests
      SET offered_at = now(), timeout_at = now() + interval '30 seconds'
      WHERE booking_id = p_booking_id AND order_sequence = v_next_tier AND status = 'pending'
      RETURNING worker_id INTO v_next_tier_workers;

      RETURN jsonb_build_object('success', true, 'message', 'rejected-next-tier-activated',
        'current_tier', v_current_tier, 'next_tier', v_next_tier, 'should_notify', true);
    ELSE
      RETURN jsonb_build_object('success', true, 'message', 'rejected-no-more-tiers',
        'current_tier', v_current_tier, 'should_notify', false);
    END IF;
  ELSE
    RETURN jsonb_build_object('success', true, 'message', 'rejected-waiting-for-tier',
      'current_tier', v_current_tier, 'responded', v_responded_in_tier,
      'total', v_total_in_tier, 'should_notify', false);
  END IF;
END;
$function$;
