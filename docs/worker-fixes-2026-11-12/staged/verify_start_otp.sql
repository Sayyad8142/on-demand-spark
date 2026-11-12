-- REVIEW ONLY. Do not apply without approval. No data reset, no new tables.
-- Keeps identity, row locks, hash validation, expiry, assignment and status guards.
CREATE OR REPLACE FUNCTION public.verify_start_otp(p_booking_id uuid, p_otp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_worker uuid; b record; o record; c record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); END IF;
  SELECT id INTO v_worker FROM public.workers WHERE user_id = v_uid::text OR id = v_uid LIMIT 1;
  IF v_worker IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); END IF;
  IF p_otp IS NULL OR p_otp !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_FORMAT'); END IF;
  SELECT id, worker_id, status, start_otp_required INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'BOOKING_NOT_FOUND'); END IF;
  IF b.worker_id IS DISTINCT FROM v_worker THEN RETURN jsonb_build_object('success', false, 'code', 'NOT_ASSIGNED'); END IF;
  IF NOT b.start_otp_required THEN RETURN jsonb_build_object('success', false, 'code', 'LEGACY_BOOKING'); END IF;
  IF b.status = 'started' THEN RETURN jsonb_build_object('success', true, 'already_started', true); END IF;
  IF b.status NOT IN ('assigned', 'accepted', 'on_the_way') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS'); END IF;
  SELECT * INTO c FROM public.start_otp_config;
  SELECT * INTO o FROM public.booking_start_otps WHERE booking_id = b.id FOR UPDATE;
  IF NOT FOUND OR o.issued_for_worker_id IS DISTINCT FROM v_worker THEN
    RETURN jsonb_build_object('success', false, 'code', 'CODE_UNAVAILABLE'); END IF;
  IF o.expires_at <= now() THEN RETURN jsonb_build_object('success', false, 'code', 'EXPIRED'); END IF;
  -- No cumulative/lifetime lock; at least five seconds between actual checks.
  IF o.last_attempt_at IS NOT NULL AND o.last_attempt_at > now() -
      make_interval(secs => GREATEST(COALESCE(c.min_seconds_between_attempts, 5), 5)) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOO_FAST'); END IF;
  IF public._start_otp_hash(p_otp, o.code_salt) <> o.code_hash THEN
    UPDATE public.booking_start_otps SET attempts = LEAST(attempts::bigint + 1, 2147483647)::int,
      last_attempt_at = now(), updated_at = now() WHERE booking_id = b.id;
    RETURN jsonb_build_object('success', false, 'code', 'WRONG_CODE');
  END IF;
  UPDATE public.booking_start_otps SET verified_at = now(), verified_by_worker_id = v_worker,
    last_attempt_at = now(), updated_at = now() WHERE booking_id = b.id;
  UPDATE public.bookings SET status = 'started', started_at = now(), updated_at = now() WHERE id = b.id;
  RETURN jsonb_build_object('success', true);
END $function$;
REVOKE ALL ON FUNCTION public.verify_start_otp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_start_otp(uuid, text) TO authenticated, service_role;