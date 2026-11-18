-- LOCAL EMPTY DATABASE ONLY. Never run this fixture on the shared backend.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.worker_connection_fresh(timestamptz,timestamptz) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.workers (
  id uuid PRIMARY KEY, user_id text, full_name text, phone text, photo_url text,
  upi_id text, community text, communities text[], service_types text[],
  is_active boolean DEFAULT true, is_available boolean DEFAULT false,
  is_busy boolean DEFAULT false, is_blocked boolean DEFAULT false, payout_ready boolean DEFAULT true,
  fcm_token text, last_heartbeat_at timestamptz, last_seen_at timestamptz,
  rating numeric, total_ratings integer DEFAULT 0, total_bookings_completed integer DEFAULT 0,
  approval_status text DEFAULT 'pending_approval', availability_requires_approval boolean DEFAULT true,
  approval_reviewed_at timestamptz, approval_reviewed_by uuid, approval_rejection_reason text,
  updated_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.workers TO authenticated;
CREATE TABLE public.bookings(id uuid PRIMARY KEY);
CREATE TABLE public.booking_requests(id uuid PRIMARY KEY);
CREATE TABLE public.worker_availability(worker_id uuid, day_of_week smallint, slots text[]);
\ir STAGED-NOT-DEPLOYED.sql
CREATE TRIGGER a01_guard_worker_approval BEFORE INSERT OR UPDATE ON public.workers
FOR EACH ROW EXECUTE FUNCTION public.guard_worker_approval();

DO $$
DECLARE s text; r boolean;
BEGIN
  IF public.worker_approval_allows_online('pending_approval',true) THEN RAISE EXCEPTION 'new pending allowed'; END IF;
  IF NOT public.worker_approval_allows_online('pending_approval',false) THEN RAISE EXCEPTION 'legacy exemption lost'; END IF;
  IF NOT public.worker_approval_allows_online('approved',true) THEN RAISE EXCEPTION 'approved refused'; END IF;
  IF public.worker_approval_allows_online(null,null) THEN RAISE EXCEPTION 'missing data allowed'; END IF;
  FOREACH s IN ARRAY ARRAY['rejected','suspended'] LOOP
    FOREACH r IN ARRAY ARRAY[true,false] LOOP
      IF public.worker_approval_allows_online(s,r) THEN RAISE EXCEPTION '% allowed requires=%',s,r; END IF;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO workers(id,full_name,approval_status,availability_requires_approval,is_available,fcm_token,communities,service_types,last_seen_at)
VALUES
 ('00000000-0000-0000-0000-000000000001','A legacy','pending_approval',false,true,'token',ARRAY['test'],ARRAY['maid'],now()),
 ('00000000-0000-0000-0000-000000000002','B approved','approved',true,true,'token',ARRAY['test'],ARRAY['maid'],now()),
 ('00000000-0000-0000-0000-000000000003','C pending','pending_approval',true,true,'token',ARRAY['test'],ARRAY['maid'],now()),
 ('00000000-0000-0000-0000-000000000004','D rejected','rejected',false,true,'token',ARRAY['test'],ARRAY['maid'],now()),
 ('00000000-0000-0000-0000-000000000005','E suspended','suspended',false,true,'token',ARRAY['test'],ARRAY['maid'],now());
INSERT INTO worker_availability
SELECT id,d::smallint,ARRAY['12:00:00'] FROM workers CROSS JOIN generate_series(0,6) d;
DO $$
DECLARE ids uuid[]; result jsonb; i integer;
BEGIN
  SELECT array_agg(worker_id) INTO ids FROM get_dispatch_eligible_workers('maid','test',0::smallint,'12:00');
  IF ids IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid] THEN
    RAISE EXCEPTION 'eligibility/filter/order wrong: %',ids;
  END IF;
  IF get_dispatch_eligible_worker_count('maid','test',0::smallint,'12:00') <> 2 THEN RAISE EXCEPTION 'count parity'; END IF;
  IF get_dispatch_eligible_worker_count('bathroom_cleaning','test',0::smallint,'12:00') <> 0 THEN RAISE EXCEPTION 'service isolation'; END IF;
  IF get_dispatch_eligible_worker_count('maid','other',0::smallint,'12:00') <> 0 THEN RAISE EXCEPTION 'community isolation'; END IF;
  -- Simulate a stale ON row from before the patch, so acceptance cannot rely only on the toggle.
  ALTER TABLE workers DISABLE TRIGGER a01_guard_worker_approval;
  UPDATE workers SET is_available=true WHERE id IN ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005');
  ALTER TABLE workers ENABLE TRIGGER a01_guard_worker_approval;
  FOR i IN 3..5 LOOP
    result := accept_booking_authoritative('11111111-1111-1111-1111-111111111111',('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid);
    IF result->>'error' <> 'WORKER_NOT_APPROVED' OR result->>'accepted' <> 'false' THEN RAISE EXCEPTION 'accept bypass: %',result; END IF;
  END LOOP;
  FOR i IN 1..2 LOOP
    result := accept_booking_authoritative('11111111-1111-1111-1111-111111111111',('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid);
    IF result->>'error' <> 'Booking not found' THEN RAISE EXCEPTION 'approved/legacy incorrectly refused: %',result; END IF;
  END LOOP;
  IF EXISTS(SELECT FROM bookings) OR EXISTS(SELECT FROM booking_requests) THEN RAISE EXCEPTION 'unexpected booking writes'; END IF;
  -- Approval must not automatically enable availability.
  UPDATE workers SET is_available=false,approval_status='approved' WHERE id='00000000-0000-0000-0000-000000000003';
  IF (SELECT is_available FROM workers WHERE id='00000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'approval enabled ON'; END IF;
  UPDATE workers SET is_available=true WHERE id='00000000-0000-0000-0000-000000000003';
  UPDATE workers SET approval_status='suspended' WHERE id='00000000-0000-0000-0000-000000000003';
  IF (SELECT is_available FROM workers WHERE id='00000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'revocation kept ON'; END IF;
  BEGIN
    UPDATE workers SET is_available=true WHERE id='00000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'suspended ON bypass';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'WORKER_NOT_APPROVED:%' THEN RAISE; END IF;
  END;
END $$;
SET ROLE authenticated;
INSERT INTO workers(id,approval_status,availability_requires_approval,is_available)
VALUES('00000000-0000-0000-0000-000000000006','approved',false,true);
UPDATE workers SET approval_status='approved',availability_requires_approval=false
WHERE id='00000000-0000-0000-0000-000000000006';
RESET ROLE;
DO $$
BEGIN
 IF NOT EXISTS(SELECT FROM workers WHERE id='00000000-0000-0000-0000-000000000006' AND approval_status='pending_approval' AND availability_requires_approval AND NOT is_available)
 THEN RAISE EXCEPTION 'old APK signup/update can self-approve'; END IF;
END $$;
SELECT 'PASS: approval matrix, legacy exemption, signup tampering, old APK ON, revocation, dispatch count/list parity, isolation and acceptance refusal' AS result;