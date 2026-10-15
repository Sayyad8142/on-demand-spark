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
     OR has_table_privilege('anon','v4_target_attestation.approved_targets','INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'V4 refused: attestation writable by runtime roles';
  END IF;
  SELECT system_identifier::text INTO sid FROM pg_catalog.pg_control_system();
  SELECT oid INTO db_oid FROM pg_catalog.pg_database WHERE datname=current_database();
  SELECT * INTO STRICT a FROM v4_target_attestation.approved_targets
    WHERE database_oid=db_oid AND cluster_system_identifier=sid AND runner_role=current_user;
  IF a.project_id='paywwbuqycovjopryele' OR a.project_id !~ '^[a-z]{20}$'
     OR a.environment <> 'isolated-synthetic' OR NOT a.control_plane_verified
     OR a.approval_ref IS NULL OR length(a.approval_ref)<12
     OR a.control_plane_evidence_hash !~ '^[a-f0-9]{64}$'
     OR a.expires_at<=clock_timestamp()
     OR current_setting('priority_v4.approved_test_project',true) IS DISTINCT FROM a.project_id
     OR current_setting('priority_v4.approval_ref',true) IS DISTINCT FROM a.approval_ref THEN
    RAISE EXCEPTION 'V4 refused: explicit verified nonproduction approval required';
  END IF;
END $guard$;


CREATE TABLE public.v4_assignment_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, generation integer NOT NULL CHECK(generation>=0), accepted_at timestamptz NOT NULL, occurred_at timestamptz NOT NULL CHECK(occurred_at>=accepted_at), batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation), FOREIGN KEY(worker_id,booking_id,generation) REFERENCES public.v4_assignments(worker_id,booking_id,generation)
);
GRANT SELECT, INSERT ON public.v4_assignment_outcomes TO service_role;
REVOKE ALL ON public.v4_assignment_outcomes FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_assignment_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_assignment_outcomes_server ON public.v4_assignment_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_assignment_outcome_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outcome_id uuid NOT NULL REFERENCES public.v4_assignment_outcomes(id), revision integer NOT NULL CHECK(revision>0), kind text NOT NULL CHECK(kind IN ('success','late','worker_cancel','no_show','excluded')), utility numeric NOT NULL CHECK(utility BETWEEN 0 AND 1), status text NOT NULL CHECK(status IN ('unverified','upheld','disputed','excluded')), attributed boolean NOT NULL, actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL, supersedes uuid, UNIQUE(outcome_id,revision), UNIQUE(id,outcome_id), FOREIGN KEY(supersedes,outcome_id) REFERENCES public.v4_assignment_outcome_revisions(id,outcome_id), CHECK((revision=1 AND supersedes IS NULL) OR (revision>1 AND supersedes IS NOT NULL))
);
GRANT SELECT, INSERT ON public.v4_assignment_outcome_revisions TO service_role;
REVOKE ALL ON public.v4_assignment_outcome_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_assignment_outcome_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_assignment_outcome_revisions_server ON public.v4_assignment_outcome_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_fault_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, generation integer NOT NULL CHECK(generation>=0), canonical_cause text NOT NULL CHECK(canonical_cause IN ('worker_withdrawal','no_show','verified_late')), occurred_at timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation,canonical_cause), FOREIGN KEY(worker_id,booking_id,generation) REFERENCES public.v4_assignments(worker_id,booking_id,generation)
);
GRANT SELECT, INSERT ON public.v4_fault_incidents TO service_role;
REVOKE ALL ON public.v4_fault_incidents FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_fault_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_fault_incidents_server ON public.v4_fault_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_fault_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.v4_fault_incidents(id), revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('unverified','upheld','disputed','excluded')), lane text NOT NULL CHECK(lane='R'), actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL, supersedes uuid, UNIQUE(incident_id,revision), UNIQUE(id,incident_id), FOREIGN KEY(supersedes,incident_id) REFERENCES public.v4_fault_revisions(id,incident_id), CHECK((revision=1 AND supersedes IS NULL) OR (revision>1 AND supersedes IS NOT NULL))
);
GRANT SELECT, INSERT ON public.v4_fault_revisions TO service_role;
REVOKE ALL ON public.v4_fault_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_fault_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_fault_revisions_server ON public.v4_fault_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_quality_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, generation integer NOT NULL CHECK(generation>=0), occurred_at timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation), FOREIGN KEY(worker_id,booking_id,generation) REFERENCES public.v4_assignments(worker_id,booking_id,generation)
);
GRANT SELECT, INSERT ON public.v4_quality_observations TO service_role;
REVOKE ALL ON public.v4_quality_observations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_quality_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_quality_observations_server ON public.v4_quality_observations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_quality_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), observation_id uuid NOT NULL REFERENCES public.v4_quality_observations(id), revision integer NOT NULL CHECK(revision>0), source text NOT NULL CHECK(source IN ('genuine_rating','complaint')), rating integer CHECK(rating BETWEEN 1 AND 5), utility numeric CHECK(utility BETWEEN 0 AND 1), status text NOT NULL CHECK(status IN ('unverified','upheld','disputed','excluded')), actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL, supersedes uuid, CHECK((source='genuine_rating' AND rating IS NOT NULL AND utility IS NULL) OR (source='complaint' AND rating IS NULL AND utility IS NOT NULL)), UNIQUE(observation_id,revision), UNIQUE(id,observation_id), FOREIGN KEY(supersedes,observation_id) REFERENCES public.v4_quality_revisions(id,observation_id), CHECK((revision=1 AND supersedes IS NULL) OR (revision>1 AND supersedes IS NOT NULL))
);
GRANT SELECT, INSERT ON public.v4_quality_revisions TO service_role;
REVOKE ALL ON public.v4_quality_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_quality_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_quality_revisions_server ON public.v4_quality_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Serialize each chain. A conflicting concurrent append must retry after re-reading latest.
CREATE FUNCTION public.v4_check_revision_chain() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent_id uuid; previous record;
BEGIN
 parent_id := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || parent_id::text,0));
 EXECUTE format('SELECT id,revision,decided_at FROM %I.%I WHERE %I=$1 ORDER BY revision DESC LIMIT 1',TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_ARGV[0]) INTO previous USING parent_id;
 IF previous.id IS NULL THEN
   IF NEW.revision<>1 OR NEW.supersedes IS NOT NULL THEN RAISE EXCEPTION 'V4 first revision must be 1'; END IF;
 ELSE
   IF NEW.revision<>previous.revision+1 OR NEW.supersedes IS DISTINCT FROM previous.id OR NEW.decided_at<previous.decided_at THEN
     RAISE EXCEPTION 'V4 revision must supersede same-parent latest with nondecreasing decision time';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_check_revision_chain() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_check_revision_chain() TO service_role;
CREATE TRIGGER v4_assignment_outcome_revisions_chain BEFORE INSERT ON public.v4_assignment_outcome_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_revision_chain('outcome_id');
CREATE TRIGGER v4_fault_revisions_chain BEFORE INSERT ON public.v4_fault_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_revision_chain('incident_id');
CREATE TRIGGER v4_quality_revisions_chain BEFORE INSERT ON public.v4_quality_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_revision_chain('observation_id');

COMMIT;
