-- READ-ONLY BACKUP. DO NOT EXECUTE.
-- Exported 2026-11-07 03:40 UTC via pg_get_functiondef from live project paywwbuqycovjopryele.
-- Execute privilege (proacl): {postgres=X/postgres,service_role=X/postgres}

CREATE OR REPLACE FUNCTION public.accept_booking_authoritative(p_booking_id uuid, p_worker_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_worker   public.workers;
  v_booking  public.bookings;
  v_auth     uuid := auth.uid();
  v_claimed  uuid;
  v_overlap  int;
  v_req      public.booking_requests;
  v_pref_req public.booking_requests;
BEGIN
  IF p_worker_id IS NOT NULL THEN
    SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id LIMIT 1;
  ELSIF v_auth IS NOT NULL THEN
    SELECT * INTO v_worker FROM public.workers
     WHERE user_id::text = v_auth::text OR id = v_auth
     LIMIT 1;
  ELSE
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Not authenticated', 'message', 'Not authenticated');
  END IF;

  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Worker not found', 'message', 'Worker not found');
  END IF;

  IF NOT COALESCE(v_worker.is_active, false) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Your account is not active', 'message', 'Your account is not active');
  END IF;
  IF COALESCE(v_worker.is_blocked, false) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Your account is blocked', 'message', 'Your account is blocked');
  END IF;
  IF COALESCE(v_worker.payout_ready, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Please add valid bank details before accepting bookings', 'message', 'Please add valid bank details before accepting bookings');
  END IF;
  IF NOT COALESCE(v_worker.is_available, false) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'You are not available', 'message', 'You are not available');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Booking not found', 'message', 'Booking not found');
  END IF;
  IF v_booking.worker_id IS NOT NULL OR v_booking.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'already_assigned', true,
                              'error', 'Already assigned to someone else', 'message', 'Already assigned to someone else');
  END IF;

  -- ── PREFERRED-WORKER RESERVATION GUARD (defense in depth) ──
  -- While the booking is reserved for the customer's chosen worker and her
  -- exclusive offer has not yet expired, nobody else may accept — regardless
  -- of stale pushes or hand-crafted requests.
  IF v_booking.preferred_worker_id IS NOT NULL
     AND v_booking.preferred_worker_id <> v_worker.id THEN
    SELECT * INTO v_pref_req FROM public.booking_requests
     WHERE booking_id = p_booking_id
       AND worker_id = v_booking.preferred_worker_id
     LIMIT 1;

    IF v_pref_req.id IS NULL OR v_pref_req.timeout_at IS NULL OR v_pref_req.timeout_at > now() THEN
      RETURN jsonb_build_object('success', false, 'accepted', false,
        'error', 'Reserved for the customer''s preferred worker',
        'message', 'Reserved for the customer''s preferred worker');
    END IF;
  END IF;

  -- ── OFFER TARGETING: a worker session may only accept a booking she was
  -- actually offered. Service-role / admin calls (explicit p_worker_id with
  -- no session) bypass this deliberately for manual assignment.
  IF v_auth IS NOT NULL THEN
    SELECT * INTO v_req FROM public.booking_requests
     WHERE booking_id = p_booking_id AND worker_id = v_worker.id
     LIMIT 1;

    IF v_req.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'accepted', false,
        'error', 'This booking was not offered to you',
        'message', 'This booking was not offered to you');
    END IF;

    IF v_req.status NOT IN ('pending','sent','queued','accepted')
       AND COALESCE(v_req.responded_at, v_req.timeout_at, now()) < now() - interval '90 seconds' THEN
      RETURN jsonb_build_object('success', false, 'accepted', false,
        'error', 'This offer has expired',
        'message', 'This offer has expired');
    END IF;
  END IF;

  IF NOT (v_booking.service_type = ANY(COALESCE(v_worker.service_types, ARRAY[]::text[]))) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Service type mismatch', 'message', 'Service type mismatch');
  END IF;
  IF NOT (v_booking.community = ANY(COALESCE(v_worker.communities, ARRAY[]::text[]))
          OR v_booking.community = v_worker.community) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Community mismatch', 'message', 'Community mismatch');
  END IF;

  SELECT count(*) INTO v_overlap
  FROM public.bookings b
  WHERE b.worker_id = v_worker.id
    AND b.id <> p_booking_id
    AND b.status IN ('assigned','accepted','on_the_way','started','confirmed','in_progress');
  IF v_overlap > 0 THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Worker is already busy with another booking', 'message', 'Worker is already busy with another booking');
  END IF;

  UPDATE public.bookings
  SET worker_id        = v_worker.id,
      worker_name      = v_worker.full_name,
      worker_phone     = v_worker.phone,
      worker_upi       = v_worker.upi_id,
      worker_photo_url = v_worker.photo_url,
      status           = 'assigned',
      dispatch_status  = 'assigned',
      assigned_at      = now(),
      accepted_at      = now(),
      confirmed_at     = now(),
      manual_assignment_required = false,
      updated_at       = now()
  WHERE id = p_booking_id
    AND worker_id IS NULL
    AND status = 'pending'
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'already_assigned', true,
                              'error', 'Already assigned to someone else', 'message', 'Already assigned to someone else');
  END IF;

  UPDATE public.workers SET is_busy = true, updated_at = now() WHERE id = v_worker.id;

  UPDATE public.booking_requests
     SET status = 'accepted', responded_at = now()
   WHERE booking_id = p_booking_id AND worker_id = v_worker.id;

  UPDATE public.booking_requests
     SET status = 'lost', responded_at = now()
   WHERE booking_id = p_booking_id
     AND worker_id <> v_worker.id
     AND status IN ('pending','sent','queued');

  UPDATE public.ops_alerts
     SET status = 'resolved', resolved_at = now(), updated_at = now()
   WHERE entity_type = 'booking'
     AND entity_id = p_booking_id
     AND alert_type IN ('manual_assignment_required',
                        'manual_assignment_required_after_redelivery',
                        'SCHEDULED_DISPATCH_NO_OFFERS',
                        'SCHEDULED_OVERDUE_NO_WORKER')
     AND status = 'open';

  BEGIN
    INSERT INTO public.booking_events (booking_id, type, meta)
    VALUES (p_booking_id, 'accepted', jsonb_build_object(
      'worker_id', v_worker.id,
      'worker_name', v_worker.full_name,
      'accepted_at', now(),
      'was_preferred_worker', (v_booking.preferred_worker_id = v_worker.id),
      'path', 'accept_booking_authoritative'
    ));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.booking_status_history (booking_id, from_status, to_status, note)
    VALUES (p_booking_id, 'pending', 'assigned',
            'Authoritative accept by worker ' || COALESCE(v_worker.full_name, v_worker.id::text));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'accepted', true, 'booking_id', p_booking_id,
                            'worker_id', v_worker.id, 'message', 'Booking accepted successfully');
END;
$function$;
