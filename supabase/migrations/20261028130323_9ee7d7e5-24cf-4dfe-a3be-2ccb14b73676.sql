-- ============ Simple Start OTP — Step A (corrected, v2) ============
CREATE TABLE public.start_otp_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  max_attempts int NOT NULL DEFAULT 5,
  min_seconds_between_attempts int NOT NULL DEFAULT 3,
  ttl_minutes int NOT NULL DEFAULT 720,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.start_otp_config (id) VALUES (true);
GRANT SELECT ON public.start_otp_config TO authenticated;
GRANT ALL ON public.start_otp_config TO service_role;
ALTER TABLE public.start_otp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read start code settings"
  ON public.start_otp_config FOR SELECT TO authenticated USING (true);

CREATE TABLE public.booking_start_otps (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  code_enc bytea NOT NULL,
  issued_for_worker_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  locked_at timestamptz,
  verified_at timestamptz,
  verified_by_worker_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.booking_start_otps TO service_role;
ALTER TABLE public.booking_start_otps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.start_otp_releases (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  released_by uuid,
  reason text,
  released_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.start_otp_releases TO service_role;
ALTER TABLE public.start_otp_releases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ADD COLUMN start_otp_required boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'start_otp_encryption_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'start_otp_encryption_key');
  END IF;
END $$;

CREATE FUNCTION public._start_otp_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'start_otp_encryption_key' LIMIT 1
$$;

CREATE FUNCTION public._start_otp_hash(p_code text, p_salt text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(extensions.hmac(p_code, p_salt, 'sha256'), 'hex')
$$;

CREATE FUNCTION public._issue_start_otp(p_booking_id uuid, p_worker_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 10000)::text, 4, '0');
  v_salt text := encode(extensions.gen_random_bytes(16), 'hex');
  v_ttl int := COALESCE((SELECT ttl_minutes FROM public.start_otp_config), 720);
BEGIN
  INSERT INTO public.booking_start_otps AS o
    (booking_id, code_hash, code_salt, code_enc, issued_for_worker_id, issued_at, expires_at)
  VALUES (p_booking_id, public._start_otp_hash(v_code, v_salt), v_salt,
          extensions.pgp_sym_encrypt(v_code, public._start_otp_key()), p_worker_id, now(),
          now() + make_interval(mins => v_ttl))
  ON CONFLICT (booking_id) DO UPDATE SET
    code_hash = EXCLUDED.code_hash, code_salt = EXCLUDED.code_salt, code_enc = EXCLUDED.code_enc,
    issued_for_worker_id = EXCLUDED.issued_for_worker_id, issued_at = EXCLUDED.issued_at,
    expires_at = EXCLUDED.expires_at, attempts = 0, last_attempt_at = NULL, locked_at = NULL,
    verified_at = NULL, verified_by_worker_id = NULL, updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public._start_otp_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._start_otp_hash(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._issue_start_otp(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.start_otp_bookings_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_server boolean := auth.uid() IS NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.start_otp_required := COALESCE((SELECT enabled FROM public.start_otp_config), false);
    IF NEW.start_otp_required AND NEW.status IN ('started', 'completed') THEN
      RAISE EXCEPTION 'New bookings cannot be created as started or completed' USING ERRCODE = '23514';
    END IF;
    IF NEW.start_otp_required THEN NEW.started_at := NULL; END IF;
    RETURN NEW;
  END IF;

  IF NEW.start_otp_required IS DISTINCT FROM OLD.start_otp_required THEN
    IF OLD.start_otp_required AND NOT NEW.start_otp_required
       AND EXISTS (SELECT 1 FROM public.start_otp_releases r WHERE r.booking_id = OLD.id) THEN
      RETURN NEW;
    END IF;
    NEW.start_otp_required := OLD.start_otp_required;
  END IF;

  IF NOT OLD.start_otp_required THEN RETURN NEW; END IF;

  IF NEW.started_at IS DISTINCT FROM OLD.started_at
     AND NOT (NEW.status = 'started' AND OLD.status IS DISTINCT FROM 'started') THEN
    NEW.started_at := OLD.started_at;
  END IF;

  IF NEW.status = 'started' AND OLD.status IS DISTINCT FROM 'started' THEN
    IF NOT EXISTS (SELECT 1 FROM public.booking_start_otps o
                    WHERE o.booking_id = NEW.id AND o.verified_at IS NOT NULL
                      AND o.issued_for_worker_id = NEW.worker_id
                      AND o.verified_by_worker_id = NEW.worker_id) THEN
      RAISE EXCEPTION 'Start code required' USING ERRCODE = '23514';
    END IF;
    NEW.started_at := COALESCE(NEW.started_at, now());
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF COALESCE(NEW.completion_source, '') = 'admin' THEN
      IF NOT (v_server OR public.is_admin()) THEN
        RAISE EXCEPTION 'Admin completion requires an admin' USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.status IS DISTINCT FROM 'started' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Booking must be started with the Start code first' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER aab_start_otp_bookings_guard
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.start_otp_bookings_guard();

CREATE FUNCTION public.start_otp_issue_on_assign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.start_otp_required THEN RETURN NEW; END IF;
  IF NEW.worker_id IS NULL THEN
    DELETE FROM public.booking_start_otps WHERE booking_id = NEW.id;
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('assigned', 'accepted', 'on_the_way') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NOT EXISTS (SELECT 1 FROM public.booking_start_otps WHERE booking_id = NEW.id) THEN
    PERFORM public._issue_start_otp(NEW.id, NEW.worker_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zza_start_otp_issue_on_assign
  AFTER INSERT OR UPDATE OF worker_id, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.start_otp_issue_on_assign();

CREATE FUNCTION public.verify_start_otp(p_booking_id uuid, p_otp text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_worker uuid; b record; o record; c record; v_left int;
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
  IF o.locked_at IS NOT NULL OR o.attempts >= c.max_attempts THEN
    RETURN jsonb_build_object('success', false, 'code', 'LOCKED'); END IF;
  IF o.expires_at <= now() THEN RETURN jsonb_build_object('success', false, 'code', 'EXPIRED'); END IF;
  IF o.last_attempt_at IS NOT NULL
     AND o.last_attempt_at > now() - make_interval(secs => c.min_seconds_between_attempts) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOO_FAST'); END IF;

  IF public._start_otp_hash(p_otp, o.code_salt) <> o.code_hash THEN
    v_left := GREATEST(c.max_attempts - o.attempts - 1, 0);
    UPDATE public.booking_start_otps
       SET attempts = attempts + 1, last_attempt_at = now(),
           locked_at = CASE WHEN v_left = 0 THEN now() END, updated_at = now()
     WHERE booking_id = b.id;
    RETURN jsonb_build_object('success', false,
      'code', CASE WHEN v_left = 0 THEN 'LOCKED' ELSE 'WRONG_CODE' END, 'attempts_left', v_left);
  END IF;

  UPDATE public.booking_start_otps
     SET verified_at = now(), verified_by_worker_id = v_worker, last_attempt_at = now(), updated_at = now()
   WHERE booking_id = b.id;
  UPDATE public.bookings SET status = 'started', started_at = now(), updated_at = now() WHERE id = b.id;
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.verify_start_otp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_start_otp(uuid, text) TO authenticated;

CREATE FUNCTION public._start_otp_for_customer(p_booking_id uuid, p_profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; o record;
BEGIN
  SELECT id, user_id, status, start_otp_required, worker_id INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR p_profile_id IS NULL OR b.user_id IS DISTINCT FROM p_profile_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND'); END IF;
  IF NOT b.start_otp_required THEN RETURN jsonb_build_object('success', true, 'required', false); END IF;
  IF b.worker_id IS NULL OR b.status NOT IN ('assigned', 'accepted', 'on_the_way') THEN
    RETURN jsonb_build_object('success', true, 'required', true, 'start_otp', NULL, 'status', b.status); END IF;
  SELECT * INTO o FROM public.booking_start_otps WHERE booking_id = b.id;
  IF NOT FOUND OR o.issued_for_worker_id IS DISTINCT FROM b.worker_id OR o.expires_at <= now() THEN
    PERFORM public._issue_start_otp(b.id, b.worker_id);
    SELECT * INTO o FROM public.booking_start_otps WHERE booking_id = b.id;
  END IF;
  RETURN jsonb_build_object('success', true, 'required', true,
    'start_otp', extensions.pgp_sym_decrypt(o.code_enc, public._start_otp_key()),
    'expires_at', o.expires_at, 'locked', o.locked_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public._start_otp_for_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_my_start_otp(p_booking_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public._start_otp_for_customer(p_booking_id, public.get_profile_id())
$$;
REVOKE ALL ON FUNCTION public.get_my_start_otp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_start_otp(uuid) TO authenticated;

CREATE FUNCTION public.service_get_start_otp(p_booking_id uuid, p_profile_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public._start_otp_for_customer(p_booking_id, p_profile_id)
$$;
REVOKE ALL ON FUNCTION public.service_get_start_otp(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_start_otp(uuid, uuid) TO service_role;

CREATE FUNCTION public.admin_reset_start_otp(p_booking_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; BEGIN
  IF NOT (auth.uid() IS NULL OR public.is_admin()) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  SELECT id, worker_id, status, start_otp_required INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT b.start_otp_required OR b.worker_id IS NULL OR b.status NOT IN ('assigned','accepted','on_the_way') THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_RESETTABLE'); END IF;
  PERFORM public._issue_start_otp(b.id, b.worker_id);
  RETURN jsonb_build_object('success', true);
END $$;

CREATE FUNCTION public.admin_release_start_otp(p_booking_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.uid() IS NULL OR public.is_admin()) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.start_otp_releases (booking_id, released_by, reason)
  VALUES (p_booking_id, auth.uid(), p_reason) ON CONFLICT (booking_id) DO NOTHING;
  UPDATE public.bookings SET start_otp_required = false WHERE id = p_booking_id AND start_otp_required;
  DELETE FROM public.booking_start_otps WHERE booking_id = p_booking_id;
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.admin_reset_start_otp(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_release_start_otp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_start_otp(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_release_start_otp(uuid, text) TO authenticated, service_role;