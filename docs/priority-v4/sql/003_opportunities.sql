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


CREATE TABLE public.v4_offer_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, request_id uuid NOT NULL UNIQUE, generation integer NOT NULL CHECK(generation>=0), round integer NOT NULL CHECK(round>=0), valid_from timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation,round), FOREIGN KEY(request_id,worker_id,booking_id,generation,round,valid_from) REFERENCES public.v4_offer_anchors(request_id,worker_id,booking_id,generation,round,valid_from)
);
GRANT SELECT, INSERT ON public.v4_offer_opportunities TO service_role;
REVOKE ALL ON public.v4_offer_opportunities FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_offer_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_offer_opportunities_server ON public.v4_offer_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE public.v4_offer_opportunity_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES public.v4_offer_opportunities(id), revision integer NOT NULL CHECK(revision>0), supersedes uuid, terminal_at timestamptz, raw_status text NOT NULL, normalized_status text NOT NULL CHECK(normalized_status IN ('accepted','rejected','lost','timed_out','technical','unresolved')), writer_version text NOT NULL, confirmed_response boolean NOT NULL DEFAULT false, ack_provenance text NOT NULL CHECK(ack_provenance IN ('independent_verified','derived_from_server_response','legacy_untrusted','none')), eligibility_provenance jsonb NOT NULL, settled boolean NOT NULL DEFAULT false, exclusion_reason text, review_status text NOT NULL CHECK(review_status IN ('unverified','upheld','disputed','excluded')), actor_ref text NOT NULL, reason text NOT NULL, policy_version text NOT NULL, evidence_refs jsonb NOT NULL, decided_at timestamptz NOT NULL,
 UNIQUE(opportunity_id,revision), UNIQUE(id,opportunity_id), FOREIGN KEY(supersedes,opportunity_id) REFERENCES public.v4_offer_opportunity_revisions(id,opportunity_id), CHECK((revision=1 AND supersedes IS NULL) OR (revision>1 AND supersedes IS NOT NULL)), CHECK(NOT settled OR terminal_at IS NOT NULL), CHECK(normalized_status NOT IN ('accepted','rejected') OR confirmed_response), CHECK(normalized_status='unresolved' OR terminal_at IS NOT NULL), CHECK(terminal_at IS NULL OR decided_at>=terminal_at)
);
GRANT SELECT, INSERT ON public.v4_offer_opportunity_revisions TO service_role;
REVOKE ALL ON public.v4_offer_opportunity_revisions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_offer_opportunity_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_offer_opportunity_revisions_server ON public.v4_offer_opportunity_revisions FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TRIGGER v4_opportunity_chain BEFORE INSERT ON public.v4_offer_opportunity_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_revision_chain('opportunity_id');
CREATE FUNCTION public.v4_check_settlement_time() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE starts timestamptz;
BEGIN
 SELECT valid_from INTO STRICT starts FROM public.v4_offer_opportunities WHERE id=NEW.opportunity_id;
 IF NEW.decided_at<starts OR NEW.terminal_at<starts THEN RAISE EXCEPTION 'V4 settlement precedes offer'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_check_settlement_time() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_check_settlement_time() TO service_role;
CREATE TRIGGER v4_settlement_time BEFORE INSERT ON public.v4_offer_opportunity_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_settlement_time();

CREATE TABLE public.v4_offer_visibility_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES public.v4_offer_opportunities(id), client_event_id text NOT NULL, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL CHECK(received_at>=occurred_at), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>=starts_at), monotonic_elapsed_ms bigint NOT NULL CHECK(monotonic_elapsed_ms>=0), client_version text NOT NULL, validation_revision integer NOT NULL CHECK(validation_revision>0), trusted boolean NOT NULL DEFAULT false, provenance text NOT NULL, UNIQUE(opportunity_id,client_event_id)
);
GRANT SELECT, INSERT ON public.v4_offer_visibility_intervals TO service_role;
REVOKE ALL ON public.v4_offer_visibility_intervals FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_offer_visibility_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_offer_visibility_intervals_server ON public.v4_offer_visibility_intervals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_availability_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL REFERENCES public.v4_workers(id), service text NOT NULL CHECK(service IN ('Maid','Bathroom Cleaning')), cohort_key text NOT NULL, canonical_key text NOT NULL UNIQUE, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>=starts_at), explicit_on boolean NOT NULL, duration_minutes numeric GENERATED ALWAYS AS (extract(epoch FROM (ends_at-starts_at))/60) STORED, observed_minutes numeric NOT NULL CHECK(observed_minutes>=0), fulfilled_minutes numeric NOT NULL CHECK(fulfilled_minutes>=0 AND fulfilled_minutes<=observed_minutes), excluded_minutes numeric NOT NULL CHECK(excluded_minutes>=0), trusted boolean NOT NULL DEFAULT false, exclusion_reason text, source_watermark timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), CHECK(observed_minutes+excluded_minutes<=duration_minutes), CHECK(explicit_on OR observed_minutes=0)
);
GRANT SELECT, INSERT ON public.v4_availability_intervals TO service_role;
REVOKE ALL ON public.v4_availability_intervals FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_availability_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_availability_intervals_server ON public.v4_availability_intervals FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
