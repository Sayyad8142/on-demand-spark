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

CREATE TABLE public.v4_onboarding_progress (
  worker_id uuid NOT NULL, formula_id uuid NOT NULL REFERENCES public.v4_formula_versions(id), lifetime_opportunities integer NOT NULL CHECK(lifetime_opportunities>=0), first_at timestamptz, fifth_at timestamptz, tenth_at timestamptz, revision integer NOT NULL CHECK(revision>0), watermark timestamptz NOT NULL, PRIMARY KEY(worker_id,formula_id)
);
GRANT SELECT, INSERT, UPDATE ON public.v4_onboarding_progress TO service_role;
REVOKE ALL ON public.v4_onboarding_progress FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_onboarding_progress_server ON public.v4_onboarding_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_score_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, formula_id uuid NOT NULL REFERENCES public.v4_formula_versions(id), batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), as_of timestamptz NOT NULL, input_hash text NOT NULL, config_hash text NOT NULL, reliability numeric NOT NULL CHECK(reliability BETWEEN 0 AND 30), quality numeric NOT NULL CHECK(quality BETWEEN 0 AND 25), responsiveness numeric NOT NULL CHECK(responsiveness=12), recent_jobs numeric NOT NULL CHECK(recent_jobs BETWEEN 9 AND 15), availability numeric NOT NULL CHECK(availability=6), total numeric(5,2) NOT NULL CHECK(total BETWEEN 0 AND 100), exact_components jsonb NOT NULL, samples jsonb NOT NULL, gate_reasons jsonb NOT NULL, exclusions jsonb NOT NULL, coverage jsonb NOT NULL, actor_ref text NOT NULL, correction_ref text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(worker_id,formula_id,as_of,input_hash,config_hash), UNIQUE(id,worker_id,formula_id)
);
GRANT SELECT, INSERT ON public.v4_score_calculations TO service_role;
REVOKE ALL ON public.v4_score_calculations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_score_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_score_calculations_server ON public.v4_score_calculations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_worker_scores (
  worker_id uuid NOT NULL, formula_id uuid NOT NULL REFERENCES public.v4_formula_versions(id), calculation_id uuid NOT NULL, as_of timestamptz NOT NULL, stale boolean NOT NULL DEFAULT false, PRIMARY KEY(worker_id,formula_id), FOREIGN KEY(calculation_id,worker_id,formula_id) REFERENCES public.v4_score_calculations(id,worker_id,formula_id)
);
GRANT SELECT, INSERT, UPDATE ON public.v4_worker_scores TO service_role;
REVOKE ALL ON public.v4_worker_scores FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_worker_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_worker_scores_server ON public.v4_worker_scores FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evidence_ref text NOT NULL, reason text NOT NULL, state text NOT NULL CHECK(state IN ('open','reviewed','excluded')), reviewer_ref text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(evidence_ref,reason)
);
GRANT SELECT, INSERT, UPDATE ON public.v4_review_queue TO service_role;
REVOKE ALL ON public.v4_review_queue FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_review_queue_server ON public.v4_review_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_calculation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_key text NOT NULL UNIQUE, worker_id uuid NOT NULL, formula_id uuid NOT NULL REFERENCES public.v4_formula_versions(id), expected_cutoff timestamptz NOT NULL, state text NOT NULL CHECK(state IN ('pending','leased','done','failed')), attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10), lease_until timestamptz, last_error_code text
);
GRANT SELECT, INSERT, UPDATE ON public.v4_calculation_jobs TO service_role;
REVOKE ALL ON public.v4_calculation_jobs FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_calculation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_calculation_jobs_server ON public.v4_calculation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
