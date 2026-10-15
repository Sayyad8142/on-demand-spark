-- DRAFT ONLY. NOT EXECUTED. Run only after independent isolated-target approval.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('priority_v4.environment', true) IS DISTINCT FROM 'isolated-synthetic'
     OR current_setting('priority_v4.approval_ref', true) IS NULL
     OR length(coalesce(current_setting('priority_v4.approval_ref', true), '')) < 12
     OR current_setting('priority_v4.expected_database', true) IS DISTINCT FROM current_database()
     OR current_database() <> 'isolated_v4_fixture'
  THEN RAISE EXCEPTION 'V4 draft refused: approved isolated fixture database required'; END IF;
END $guard$;

CREATE TABLE public.v4_formula_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version text NOT NULL UNIQUE, config_hash text NOT NULL UNIQUE, approval_ref text NOT NULL, schema_version integer NOT NULL CHECK(schema_version=1), caps integer[] NOT NULL CHECK(caps=ARRAY[30,25,20,15,10]), priors integer[] NOT NULL CHECK(priors=ARRAY[18,15,12,9,6]), penalty integer NOT NULL CHECK(penalty=0), windows_days integer[] NOT NULL CHECK(windows_days=ARRAY[30,90,30,7,14]), sample_thresholds integer[] NOT NULL CHECK(sample_thresholds=ARRAY[5,10]), oa_locked boolean NOT NULL CHECK(oa_locked), registered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.v4_formula_versions TO service_role;
REVOKE ALL ON public.v4_formula_versions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_formula_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_formula_versions_server ON public.v4_formula_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_evidence_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), formula_id uuid NOT NULL REFERENCES public.v4_formula_versions(id), environment text NOT NULL CHECK(environment='isolated-synthetic'), manifest_hash text NOT NULL UNIQUE, source_cutoff timestamptz NOT NULL, ingestion_cutoff timestamptz NOT NULL, policy_version text NOT NULL, coverage jsonb NOT NULL CHECK(jsonb_typeof(coverage)='object'), CHECK(source_cutoff<=ingestion_cutoff)
);
GRANT SELECT, INSERT ON public.v4_evidence_batches TO service_role;
REVOKE ALL ON public.v4_evidence_batches FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_evidence_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_evidence_batches_server ON public.v4_evidence_batches FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
