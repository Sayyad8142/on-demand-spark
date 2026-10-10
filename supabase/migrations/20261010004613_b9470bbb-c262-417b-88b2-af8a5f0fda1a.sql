CREATE OR REPLACE FUNCTION public.reject_booking_offer(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_worker_id uuid;
  v_req public.booking_requests;
  v_status text;
  v_res jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'confirmed', false, 'error', 'not-authenticated');
  END IF;
  SELECT id INTO v_worker_id FROM public.workers
   WHERE user_id::text = v_auth::text OR id = v_auth LIMIT 1;
  IF v_worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'confirmed', false, 'error', 'worker-not-found');
  END IF;

  SELECT * INTO v_req FROM public.booking_requests
   WHERE booking_id = p_booking_id AND worker_id = v_worker_id
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'confirmed', false, 'error', 'request-not-found');
  END IF;
  IF v_req.status = 'rejected' THEN
    RETURN jsonb_build_object('success', true, 'confirmed', true, 'already_rejected', true,
                              'booking_request_id', v_req.id);
  END IF;

  SELECT status INTO v_status FROM public.bookings WHERE id = p_booking_id;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'confirmed', false, 'error', 'booking-already-accepted');
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'confirmed', false, 'error', 'offer-closed', 'request_status', v_req.status);
  END IF;
  IF v_req.timeout_at IS NOT NULL AND v_req.timeout_at < now() THEN
    RETURN jsonb_build_object('success', false, 'confirmed', false, 'error', 'offer-expired');
  END IF;

  v_res := public.reject_booking_request(p_booking_id, v_worker_id);
  RETURN COALESCE(v_res, '{}'::jsonb)
         || jsonb_build_object('confirmed', COALESCE((v_res->>'success')::boolean, false),
                               'booking_request_id', v_req.id);
END $$;

REVOKE EXECUTE ON FUNCTION public.reject_booking_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_booking_offer(uuid) TO authenticated, service_role;