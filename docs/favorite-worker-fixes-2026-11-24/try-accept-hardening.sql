-- STAGED FOR ADMIN REVIEW ONLY. NOT APPLIED. Do not run from the Worker App project.
-- Goal: harden the EXISTING try_accept_booking (same name, same argument, same
-- EXECUTE grant) so it is the single canonical worker acceptance API, and add the
-- read-only favorite-v1 status read. No new acceptance endpoint, no new grant on
-- accept_booking. Response keys used by 10.0.05 (success, accepted, error, message,
-- already_assigned, booking_id, worker_id) are unchanged; `offer` is additive.

CREATE OR REPLACE FUNCTION public._favorite_v1_offer(p_req public.booking_requests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_req.id IS NULL THEN NULL ELSE jsonb_build_object(
    'contract_version', 'favorite-v1',
    'booking_id', p_req.booking_id,
    'request_id', p_req.id,
    'offer_generation', 1 + COALESCE(p_req.redelivery_count, 0),
    'status', CASE WHEN p_req.status IN ('pending','sent','queued') AND p_req.timeout_at <= now() THEN 'expired'
                   WHEN p_req.status IN ('pending','sent','queued','accepted','rejected','expired','lost','cancelled') THEN p_req.status
                   ELSE 'expired' END,
    'actionable', (p_req.status IN ('pending','sent','queued') AND p_req.timeout_at IS NOT NULL AND p_req.timeout_at > now()),
    'expires_at', to_char(p_req.timeout_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'server_time', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) END
$$;
REVOKE ALL ON FUNCTION public._favorite_v1_offer(public.booking_requests) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_worker public.workers;
  v_booking public.bookings;
  v_req public.booking_requests;
  v_result jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Not authenticated', 'message', 'Not authenticated');
  END IF;
  -- Same lock order for every caller: booking, then worker, then own request (F6).
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT * INTO v_worker FROM public.workers WHERE user_id::text = v_auth::text OR id = v_auth LIMIT 1 FOR UPDATE;
  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Worker not found', 'message', 'Worker not found');
  END IF;
  SELECT * INTO v_req FROM public.booking_requests
   WHERE booking_id = p_booking_id AND worker_id = v_worker.id
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  -- Idempotent retry: this worker already won → same success answer.
  IF v_booking.id IS NOT NULL AND v_booking.worker_id = v_worker.id AND v_req.status = 'accepted' THEN
    RETURN jsonb_build_object('success', true, 'accepted', true, 'idempotent', true, 'booking_id', p_booking_id,
      'worker_id', v_worker.id, 'message', 'Booking accepted successfully', 'offer', public._favorite_v1_offer(v_req));
  END IF;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'This booking was not offered to you',
      'message', 'This booking was not offered to you');
  END IF;
  -- Strict original expiry (F1): no 90-second grace for open offers.
  IF v_req.status NOT IN ('pending','sent','queued') OR v_req.timeout_at IS NULL OR v_req.timeout_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'This offer has expired',
      'message', 'This offer has expired', 'offer', public._favorite_v1_offer(v_req));
  END IF;
  -- All existing approval, payout, availability, eligibility, operating-hours,
  -- favorite reservation and assignment rules stay in the authoritative core.
  v_result := public.accept_booking_authoritative(p_booking_id, NULL);
  SELECT * INTO v_req FROM public.booking_requests WHERE id = v_req.id;
  RETURN v_result || jsonb_build_object('offer', public._favorite_v1_offer(v_req));
END $function$;
-- Grants unchanged: try_accept_booking already executable by authenticated.

CREATE OR REPLACE FUNCTION public.get_my_offer_status(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_worker uuid; v_req public.booking_requests;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_worker FROM public.workers WHERE user_id::text = auth.uid()::text OR id = auth.uid() LIMIT 1;
  IF v_worker IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_req FROM public.booking_requests WHERE booking_id = p_booking_id AND worker_id = v_worker
   ORDER BY created_at DESC LIMIT 1;
  RETURN public._favorite_v1_offer(v_req);
END $$;
REVOKE ALL ON FUNCTION public.get_my_offer_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_offer_status(uuid) TO authenticated;
