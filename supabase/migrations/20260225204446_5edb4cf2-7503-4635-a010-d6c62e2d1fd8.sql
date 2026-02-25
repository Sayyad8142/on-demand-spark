
CREATE OR REPLACE FUNCTION public.dispatch_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_worker RECORD;
  v_token TEXT;
  v_body TEXT;
  v_data JSONB;
  v_lock_key BIGINT;
  v_seq INT := 0;
  v_base_url TEXT := 'https://paywwbuqycovjopryele.supabase.co';
  v_service_key TEXT;
BEGIN
  v_lock_key := hashtextextended(p_booking_id::text, 0);

  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RAISE LOG 'dispatch_booking: Could not acquire lock for booking %, skipping', p_booking_id;
    RETURN;
  END IF;

  BEGIN
    -- Get service role key from vault or env
    v_service_key := coalesce(
      current_setting('app.settings.service_role_key', true),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    );

    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    IF v_booking.status NOT IN ('pending', 'confirmed') OR v_booking.worker_id IS NOT NULL THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM booking_requests br WHERE br.booking_id = p_booking_id AND br.status = 'accepted') THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    SELECT COALESCE(MAX(br.order_sequence), 0) INTO v_seq
    FROM booking_requests br WHERE br.booking_id = p_booking_id;

    v_body := v_booking.service_type || ' • ' || v_booking.community || ' • Flat ' || COALESCE(v_booking.flat_no, '');
    v_data := jsonb_build_object(
      'type', 'BOOKING_ALERT',
      'booking_id', v_booking.id,
      'bookingId', v_booking.id,
      'booking_type', v_booking.booking_type,
      'service_type', v_booking.service_type,
      'serviceType', v_booking.service_type,
      'community', v_booking.community,
      'flat_no', COALESCE(v_booking.flat_no, ''),
      'customer', COALESCE(v_booking.cust_name, ''),
      'customer_name', COALESCE(v_booking.cust_name, ''),
      'price', COALESCE(v_booking.price_inr, 0)::text,
      'location', ''
    );

    FOR v_worker IN
      SELECT w.id, w.full_name, w.user_id, w.fcm_token
      FROM workers w
      WHERE w.is_active = true
        AND w.is_available = true
        AND w.is_busy = false
        AND v_booking.service_type = ANY(w.service_types)
        AND (w.communities IS NULL OR array_length(w.communities, 1) IS NULL OR v_booking.community = ANY(w.communities))
        AND NOT EXISTS (SELECT 1 FROM booking_requests br WHERE br.booking_id = p_booking_id AND br.worker_id = w.id)
      ORDER BY w.last_seen_at DESC NULLS LAST, w.rating DESC NULLS LAST, w.total_bookings_completed DESC NULLS LAST
      LIMIT 5
    LOOP
      v_seq := v_seq + 1;

      INSERT INTO booking_requests (booking_id, worker_id, order_sequence, timeout_at, status, notification_status)
      VALUES (p_booking_id, v_worker.id, v_seq, now() + interval '45 seconds', 'pending', 'sent')
      ON CONFLICT (booking_id, worker_id) DO NOTHING;

      -- Primary: workers.fcm_token; Fallback: fcm_tokens table
      v_token := v_worker.fcm_token;
      IF v_token IS NULL THEN
        SELECT token INTO v_token FROM fcm_tokens WHERE user_id = v_worker.id;
      END IF;
      -- Also try user_id (string) lookup in fcm_tokens if worker has user_id
      IF v_token IS NULL AND v_worker.user_id IS NOT NULL THEN
        SELECT token INTO v_token FROM fcm_tokens WHERE user_id::text = v_worker.user_id;
      END IF;

      IF v_token IS NOT NULL AND v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_base_url || '/functions/v1/send-fcm',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
          body := jsonb_build_object(
            'workerIds', jsonb_build_array(COALESCE(v_worker.user_id, v_worker.id::text)),
            'title', 'New Booking',
            'body', v_body,
            'data', v_data
          )
        );
      END IF;
    END LOOP;

    PERFORM pg_advisory_unlock(v_lock_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;
END;
$$;
