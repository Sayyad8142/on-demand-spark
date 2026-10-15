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

CREATE TABLE public.v4_assignment_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, generation integer NOT NULL CHECK(generation>=0), accepted_at timestamptz NOT NULL, occurred_at timestamptz NOT NULL CHECK(occurred_at>=accepted_at), batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation)
);
GRANT SELECT, INSERT ON public.v4_assignment_outcomes TO service_role;
REVOKE ALL ON public.v4_assignment_outcomes FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_assignment_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_assignment_outcomes_server ON public.v4_assignment_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_assignment_outcome_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outcome_id uuid NOT NULL REFERENCES public.v4_assignment_outcomes(id), revision integer NOT NULL CHECK(revision>0), kind text NOT NULL CHECK(kind IN ('success','late','worker_cancel','no_show','excluded')), utility numeric NOT NULL CHECK(utility BETWEEN 0 AND 1), status text NOT NULL CHECK(status IN ('unverified','upheld','disputed','excluded')), attributed boolean NOT NULL, actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL, supersedes uuid REFERENCES public.v4_assignment_outcome_revisions(id), UNIQUE(outcome_id,revision)
);
GRANT SELECT, INSERT ON public.v4_assignment_outcome_revisions TO service_role;
REVOKE ALL ON public.v4_assignment_outcome_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_assignment_outcome_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_assignment_outcome_revisions_server ON public.v4_assignment_outcome_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_fault_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, generation integer NOT NULL CHECK(generation>=0), canonical_cause text NOT NULL CHECK(canonical_cause IN ('worker_withdrawal','no_show','verified_late')), occurred_at timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation,canonical_cause)
);
GRANT SELECT, INSERT ON public.v4_fault_incidents TO service_role;
REVOKE ALL ON public.v4_fault_incidents FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_fault_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_fault_incidents_server ON public.v4_fault_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_fault_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.v4_fault_incidents(id), revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('unverified','upheld','disputed','excluded')), lane text NOT NULL CHECK(lane='R'), actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL, supersedes uuid REFERENCES public.v4_fault_revisions(id), UNIQUE(incident_id,revision)
);
GRANT SELECT, INSERT ON public.v4_fault_revisions TO service_role;
REVOKE ALL ON public.v4_fault_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_fault_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_fault_revisions_server ON public.v4_fault_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_quality_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, generation integer NOT NULL CHECK(generation>=0), occurred_at timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation)
);
GRANT SELECT, INSERT ON public.v4_quality_observations TO service_role;
REVOKE ALL ON public.v4_quality_observations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_quality_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_quality_observations_server ON public.v4_quality_observations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_quality_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), observation_id uuid NOT NULL REFERENCES public.v4_quality_observations(id), revision integer NOT NULL CHECK(revision>0), source text NOT NULL CHECK(source IN ('genuine_rating','complaint')), rating numeric CHECK(rating BETWEEN 1 AND 5), utility numeric CHECK(utility BETWEEN 0 AND 1), status text NOT NULL CHECK(status IN ('unverified','upheld','disputed','excluded')), actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL, supersedes uuid REFERENCES public.v4_quality_revisions(id), CHECK((source='genuine_rating' AND rating IS NOT NULL) OR (source='complaint' AND utility IS NOT NULL)), UNIQUE(observation_id,revision)
);
GRANT SELECT, INSERT ON public.v4_quality_revisions TO service_role;
REVOKE ALL ON public.v4_quality_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_quality_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_quality_revisions_server ON public.v4_quality_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
