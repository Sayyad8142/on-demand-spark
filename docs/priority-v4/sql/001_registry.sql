-- DRAFT ONLY: NOT EXECUTED. External independently verified target attestation REQUIRED.
BEGIN;
DO $guard$
DECLARE a record; sid text; db_oid oid;
BEGIN
  IF to_regclass('v4_target_attestation.approved_targets') IS NULL THEN
    RAISE EXCEPTION 'V4 refused: independently provisioned target attestation absent';
  END IF;
  -- Protected attestation is provisioned separately by the verification owner, never by these drafts.
  IF has_table_privilege('service_role','v4_target_attestation.approved_targets','INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated','v4_target_attestation.approved_targets','INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('anon','v4_target_attestation.approved_targets','INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege(current_user,'v4_target_attestation.approved_targets','INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'V4 refused: attestation writable by runtime roles';
  END IF;
  SELECT system_identifier::text INTO sid FROM pg_catalog.pg_control_system();
  SELECT oid INTO db_oid FROM pg_catalog.pg_database WHERE datname=current_database();
  SELECT * INTO STRICT a FROM v4_target_attestation.approved_targets
    WHERE database_oid=db_oid AND cluster_system_identifier=sid AND runner_role=current_user;
  IF a.project_id IS NULL OR a.project_id='paywwbuqycovjopryele' OR a.project_id !~ '^[a-z]{20}$'
     OR a.environment IS DISTINCT FROM 'isolated-synthetic' OR a.control_plane_verified IS DISTINCT FROM true
     OR a.approval_ref IS NULL OR length(a.approval_ref)<12
     OR a.control_plane_evidence_hash IS NULL OR a.control_plane_evidence_hash !~ '^[a-f0-9]{64}$'
     OR a.expires_at IS NULL OR NOT isfinite(a.expires_at) OR a.expires_at<=clock_timestamp()
     OR current_setting('priority_v4.approved_test_project',true) IS DISTINCT FROM a.project_id
     OR current_setting('priority_v4.approval_ref',true) IS DISTINCT FROM a.approval_ref THEN
    RAISE EXCEPTION 'V4 refused: explicit verified nonproduction approval required';
  END IF;
END $guard$;


CREATE TABLE public.v4_formula_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version text NOT NULL UNIQUE, config_hash text NOT NULL UNIQUE, approval_ref text NOT NULL, schema_version integer NOT NULL CHECK(schema_version=1), caps integer[] NOT NULL CHECK(caps=ARRAY[30,25,20,15,10]), priors integer[] NOT NULL CHECK(priors=ARRAY[18,15,12,9,6]), penalty integer NOT NULL CHECK(penalty=0), windows_days integer[] NOT NULL CHECK(windows_days=ARRAY[30,90,30,7,14]), sample_thresholds integer[] NOT NULL CHECK(sample_thresholds=ARRAY[5,10]), oa_locked boolean NOT NULL CHECK(oa_locked), registered_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,config_hash)
);
GRANT SELECT, INSERT ON public.v4_formula_versions TO service_role;
REVOKE ALL ON public.v4_formula_versions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_formula_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_formula_versions_server ON public.v4_formula_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_evidence_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), formula_id uuid NOT NULL REFERENCES public.v4_formula_versions(id), environment text NOT NULL CHECK(environment='isolated-synthetic'), manifest_hash text NOT NULL UNIQUE, source_cutoff timestamptz NOT NULL, ingestion_cutoff timestamptz NOT NULL, policy_version text NOT NULL, ownership_manifest_hash text NOT NULL CHECK(ownership_manifest_hash ~ '^[a-f0-9]{64}$'), coverage jsonb NOT NULL CHECK(jsonb_typeof(coverage)='object'), CHECK(source_cutoff<=ingestion_cutoff), UNIQUE(id,formula_id)
);
GRANT SELECT, INSERT ON public.v4_evidence_batches TO service_role;
REVOKE ALL ON public.v4_evidence_batches FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_evidence_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_evidence_batches_server ON public.v4_evidence_batches FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Trusted adapter first verifies source ownership; these are synthetic-only fixture anchors.
CREATE TABLE public.v4_workers (
 id uuid PRIMARY KEY, source_ref text NOT NULL UNIQUE, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id)
);
GRANT SELECT, INSERT ON public.v4_workers TO service_role;
REVOKE ALL ON public.v4_workers FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_workers_server ON public.v4_workers FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.v4_bookings (
 id uuid PRIMARY KEY, source_ref text NOT NULL UNIQUE, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id)
);
GRANT SELECT, INSERT ON public.v4_bookings TO service_role;
REVOKE ALL ON public.v4_bookings FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_bookings_server ON public.v4_bookings FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.v4_assignments (
 worker_id uuid NOT NULL REFERENCES public.v4_workers(id), booking_id uuid NOT NULL REFERENCES public.v4_bookings(id), generation integer NOT NULL CHECK(generation>=0), accepted_at timestamptz NOT NULL, source_ref text NOT NULL UNIQUE, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), PRIMARY KEY(worker_id,booking_id,generation), UNIQUE(worker_id,booking_id,generation,accepted_at)
);
GRANT SELECT, INSERT ON public.v4_assignments TO service_role;
REVOKE ALL ON public.v4_assignments FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_assignments_server ON public.v4_assignments FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.v4_offer_anchors (
 request_id uuid PRIMARY KEY, worker_id uuid NOT NULL REFERENCES public.v4_workers(id), booking_id uuid NOT NULL REFERENCES public.v4_bookings(id), generation integer NOT NULL CHECK(generation>=0), round integer NOT NULL CHECK(round>=0), valid_from timestamptz NOT NULL, source_ref text NOT NULL UNIQUE, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(request_id,worker_id,booking_id,generation,round,valid_from), UNIQUE(worker_id,booking_id,generation,round)
);
GRANT SELECT, INSERT ON public.v4_offer_anchors TO service_role;
REVOKE ALL ON public.v4_offer_anchors FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_offer_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_offer_anchors_server ON public.v4_offer_anchors FOR ALL TO service_role USING(true) WITH CHECK(true);

COMMIT;
