-- Disposable copy of the production pieces Step A touches (live definitions copied 28 Oct 2026).
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA vault;
CREATE EXTENSION pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, phone text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- vault mock (same API shape as supabase_vault)
CREATE TABLE vault.secrets (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, name text UNIQUE, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text) RETURNS uuid LANGUAGE sql AS
$$ INSERT INTO vault.secrets(name, secret) VALUES (new_name, new_secret) RETURNING id $$;

CREATE TYPE public.app_role AS ENUM ('admin','worker','customer');
CREATE TABLE public.user_roles (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, role app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT public.has_role(auth.uid(), 'admin'::public.app_role) $$;
CREATE TABLE public.workers (id uuid PRIMARY KEY, user_id text, full_name text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, firebase_uid text);
CREATE FUNCTION public.get_profile_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid; BEGIN
  SELECT p.id INTO r FROM public.profiles p WHERE p.firebase_uid = auth.uid()::text LIMIT 1; IF r IS NOT NULL THEN RETURN r; END IF;
  SELECT p.id INTO r FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1; RETURN r; END $$;
CREATE TABLE public.booking_events (id bigserial, booking_id uuid, type text, meta jsonb);

CREATE TABLE public.bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL, service_type text NOT NULL DEFAULT 'maid',
  booking_type text NOT NULL DEFAULT 'instant', scheduled_date date, scheduled_time time,
  status text NOT NULL DEFAULT 'pending', cust_name text NOT NULL DEFAULT 'c', cust_phone text NOT NULL DEFAULT '1',
  community text NOT NULL DEFAULT 'x', flat_no text NOT NULL DEFAULT '1', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), prealert_sent boolean NOT NULL DEFAULT false,
  assigned_at timestamptz, completed_at timestamptz, worker_id uuid, worker_name text, worker_phone text, worker_upi text,
  worker_photo_url text, accepted_at timestamptz, on_the_way_at timestamptz, started_at timestamptz,
  reach_status text DEFAULT 'pending', reach_confirmed_at timestamptz, reach_confirmed_by text,
  dispatch_status text NOT NULL DEFAULT 'pending', confirmed_at timestamptz, cancelled_at timestamptz,
  cancel_reason text, cancel_source text, completion_otp text, completed_by text, completion_source text,
  otp_verified_at timestamptz, price_inr int);

-- live: trg_enforce_server_completion_otp (BEFORE INSERT)
CREATE FUNCTION public.enforce_server_completion_otp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.completion_otp := lpad(floor(random() * 10000)::int::text, 4, '0'); RETURN NEW; END $$;
CREATE TRIGGER trg_enforce_server_completion_otp BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION enforce_server_completion_otp();

-- live: booking_status_transition_guard
CREATE FUNCTION public.enforce_booking_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('assigned','accepted','cancelled') THEN RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status; END IF;
    IF OLD.status = 'assigned' AND NEW.status NOT IN ('accepted','started','completed','cancelled','pending') THEN RAISE EXCEPTION 'Invalid transition from assigned to %', NEW.status; END IF;
    IF OLD.status = 'accepted' AND NEW.status NOT IN ('on_the_way','started','completed','cancelled','pending') THEN RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status; END IF;
    IF OLD.status = 'on_the_way' AND NEW.status NOT IN ('started','completed','cancelled','pending') THEN RAISE EXCEPTION 'Invalid transition from on_the_way to %', NEW.status; END IF;
    IF OLD.status = 'started' AND NEW.status NOT IN ('completed','cancelled') THEN RAISE EXCEPTION 'Invalid transition from started to %', NEW.status; END IF;
    IF OLD.status = 'completed' THEN RAISE EXCEPTION 'Cannot change status from completed'; END IF;
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot change status from cancelled'; END IF;
  END IF;
  RETURN NEW; END $$;
CREATE TRIGGER booking_status_transition_guard BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION enforce_booking_status_transition();

-- live: aaa_guard_scheduled_booking_assignment_window (trimmed to its field effects)
CREATE FUNCTION public.guard_scheduled_booking_assignment_window() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.booking_type = 'scheduled' AND COALESCE(NEW.prealert_sent,false) = false AND NEW.status NOT IN ('completed','cancelled')
     AND (NEW.worker_id IS NOT NULL OR NEW.status IN ('assigned','accepted')) THEN
    NEW.worker_id := NULL; NEW.assigned_at := NULL; NEW.started_at := NULL; NEW.status := 'pending'; NEW.dispatch_status := 'pending';
  END IF; RETURN NEW; END $$;
CREATE TRIGGER aaa_guard_scheduled_booking_assignment_window BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION guard_scheduled_booking_assignment_window();

-- live: trg_guard_booking_completion_source (BEFORE UPDATE OF status)
CREATE FUNCTION public.guard_booking_completion_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF COALESCE(NEW.completion_source,'') NOT IN ('otp','admin') THEN RAISE EXCEPTION 'Booking completion must use OTP or admin completion flow' USING ERRCODE='23514'; END IF;
    IF COALESCE(NEW.completed_by,'') NOT IN ('worker','admin') THEN RAISE EXCEPTION 'completed_by' USING ERRCODE='23514'; END IF;
    IF NEW.completion_source = 'otp' THEN
      IF NEW.completed_by <> 'worker' THEN RAISE EXCEPTION 'OTP completion must be completed_by worker' USING ERRCODE='23514'; END IF;
      IF NEW.otp_verified_at IS NULL THEN RAISE EXCEPTION 'OTP completion requires otp_verified_at' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.completion_source = 'admin' AND NEW.completed_by <> 'admin' THEN RAISE EXCEPTION 'Admin completion must be completed_by admin' USING ERRCODE='23514'; END IF;
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_guard_booking_completion_source BEFORE UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION guard_booking_completion_source();

-- live grants/policies relevant to direct writes
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated, anon;
GRANT ALL ON public.bookings TO service_role;
GRANT SELECT ON public.workers, public.profiles TO authenticated;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_select_own_firebase ON public.bookings FOR SELECT USING (user_id = get_profile_id());
CREATE POLICY bookings_update_own_firebase ON public.bookings FOR UPDATE USING (user_id = get_profile_id());
CREATE POLICY bookings_insert_own_firebase ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY bookings_worker_select_assigned ON public.bookings FOR SELECT USING (EXISTS (SELECT 1 FROM workers w WHERE w.id = bookings.worker_id AND (w.id = auth.uid() OR w.user_id = auth.uid()::text)));
CREATE POLICY bookings_worker_update_assigned ON public.bookings FOR UPDATE USING (EXISTS (SELECT 1 FROM workers w WHERE w.id = bookings.worker_id AND (w.id = auth.uid() OR w.user_id = auth.uid()::text)));
CREATE POLICY bookings_admin_select ON public.bookings FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY bookings_admin_update ON public.bookings FOR UPDATE TO authenticated USING (is_admin());

-- live: admin_complete_booking_with_otp (admin enters End code)
CREATE FUNCTION public.admin_complete_booking_with_otp(p_booking_id uuid, p_otp text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_expected text; BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT completion_otp INTO v_expected FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF p_otp <> v_expected THEN RETURN jsonb_build_object('success', false); END IF;
  UPDATE bookings SET status='completed', completion_source='otp', completed_by='worker', otp_verified_at=now(), completed_at=now() WHERE id = p_booking_id;
  RETURN jsonb_build_object('success', true); END $$;
GRANT EXECUTE ON FUNCTION public.admin_complete_booking_with_otp(uuid, text) TO authenticated;
