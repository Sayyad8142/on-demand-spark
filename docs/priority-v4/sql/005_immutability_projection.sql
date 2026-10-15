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


CREATE FUNCTION public.v4_deny_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'V4 history is append-only; append a reviewed revision'; END $$;
REVOKE ALL ON FUNCTION public.v4_deny_history_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_deny_history_change() TO service_role;
CREATE TRIGGER v4_immutable_formula_versions BEFORE UPDATE OR DELETE ON public.v4_formula_versions FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_evidence_batches BEFORE UPDATE OR DELETE ON public.v4_evidence_batches FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_assignment_outcomes BEFORE UPDATE OR DELETE ON public.v4_assignment_outcomes FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_assignment_outcome_revisions BEFORE UPDATE OR DELETE ON public.v4_assignment_outcome_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_fault_incidents BEFORE UPDATE OR DELETE ON public.v4_fault_incidents FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_fault_revisions BEFORE UPDATE OR DELETE ON public.v4_fault_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_quality_observations BEFORE UPDATE OR DELETE ON public.v4_quality_observations FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_quality_revisions BEFORE UPDATE OR DELETE ON public.v4_quality_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_offer_opportunities BEFORE UPDATE OR DELETE ON public.v4_offer_opportunities FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_offer_visibility_intervals BEFORE UPDATE OR DELETE ON public.v4_offer_visibility_intervals FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_availability_intervals BEFORE UPDATE OR DELETE ON public.v4_availability_intervals FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_score_calculations BEFORE UPDATE OR DELETE ON public.v4_score_calculations FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();

CREATE TRIGGER v4_immutable_offer_revisions BEFORE UPDATE OR DELETE ON public.v4_offer_opportunity_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_workers BEFORE UPDATE OR DELETE ON public.v4_workers FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_bookings BEFORE UPDATE OR DELETE ON public.v4_bookings FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_assignments BEFORE UPDATE OR DELETE ON public.v4_assignments FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
CREATE TRIGGER v4_immutable_offer_anchors BEFORE UPDATE OR DELETE ON public.v4_offer_anchors FOR EACH ROW EXECUTE FUNCTION public.v4_deny_history_change();
-- TRUNCATE is a history mutation too, even for elevated fixture writers.
DO $truncation$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['v4_formula_versions','v4_evidence_batches','v4_workers','v4_bookings','v4_assignments','v4_offer_anchors','v4_assignment_outcomes','v4_assignment_outcome_revisions','v4_fault_incidents','v4_fault_revisions','v4_quality_observations','v4_quality_revisions','v4_offer_opportunities','v4_offer_opportunity_revisions','v4_offer_visibility_intervals','v4_availability_intervals','v4_score_calculations'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.v4_deny_history_change()',t || '_no_truncate',t);
 END LOOP;
END $truncation$;

-- Decision cannot predate its immutable event. Cross-parent ownership is enforced by composite FKs.
CREATE FUNCTION public.v4_check_decision_time() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE happened timestamptz;
BEGIN
 EXECUTE format('SELECT occurred_at FROM public.%I WHERE id=$1',TG_ARGV[1]) INTO STRICT happened USING (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 IF NEW.decided_at<happened THEN RAISE EXCEPTION 'V4 decision precedes event'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_check_decision_time() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_check_decision_time() TO service_role;
CREATE TRIGGER v4_outcome_decision_time BEFORE INSERT ON public.v4_assignment_outcome_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_decision_time('outcome_id','v4_assignment_outcomes');
CREATE TRIGGER v4_fault_decision_time BEFORE INSERT ON public.v4_fault_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_decision_time('incident_id','v4_fault_incidents');
CREATE TRIGGER v4_quality_decision_time BEFORE INSERT ON public.v4_quality_revisions FOR EACH ROW EXECUTE FUNCTION public.v4_check_decision_time('observation_id','v4_quality_observations');

-- Exact component strings, not rounded displays, are the authoritative total inputs.
CREATE FUNCTION public.v4_fraction_numeric(p_text text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric; d numeric;
BEGIN
 IF p_text IS NULL OR p_text !~ '^[0-9]{1,1000}/[1-9][0-9]{0,999}$' THEN RAISE EXCEPTION 'V4 invalid exact rational'; END IF;
 n:=split_part(p_text,'/',1)::numeric; d:=split_part(p_text,'/',2)::numeric;
 RETURN n/d;
END $$;
REVOKE ALL ON FUNCTION public.v4_fraction_numeric(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_fraction_numeric(text) TO service_role;
-- Sum integer fractions before rounding; decimal division must not decide half-cent ties.
CREATE FUNCTION public.v4_exact_total(p_components jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text; v text; n numeric:=0; d numeric:=1; vn numeric; vd numeric;
BEGIN
 FOREACH k IN ARRAY ARRAY['R','Q','O','J','A'] LOOP
  v:=p_components->>k;
  PERFORM public.v4_fraction_numeric(v); -- validate bounded, nonnegative integer fraction
  vn:=split_part(v,'/',1)::numeric; vd:=split_part(v,'/',2)::numeric;
  n:=n*vd+vn*d; d:=d*vd;
 END LOOP;
 RETURN div(200*n+d,2*d)/100;
END $$;
REVOKE ALL ON FUNCTION public.v4_exact_total(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_exact_total(jsonb) TO service_role;
CREATE FUNCTION public.v4_check_calculation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prior integer; r numeric; q numeric; o numeric; j numeric; a numeric; cutoff timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.worker_id::text || ':' || NEW.formula_id::text,0));
 SELECT max(calculation_revision) INTO prior FROM public.v4_score_calculations WHERE worker_id=NEW.worker_id AND formula_id=NEW.formula_id AND as_of=NEW.as_of;
 IF NEW.calculation_revision<>coalesce(prior,0)+1 OR (prior IS NOT NULL AND nullif(btrim(NEW.correction_ref),'') IS NULL) THEN RAISE EXCEPTION 'V4 ordered reviewed correction required'; END IF;
 SELECT ingestion_cutoff INTO STRICT cutoff FROM public.v4_evidence_batches WHERE id=NEW.batch_id AND formula_id=NEW.formula_id;
 IF cutoff>NEW.as_of THEN RAISE EXCEPTION 'V4 future batch'; END IF;
 IF jsonb_typeof(NEW.exact_components)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(NEW.exact_components))<>5 THEN RAISE EXCEPTION 'V4 component keys'; END IF;
 r:=public.v4_fraction_numeric(NEW.exact_components->>'R'); q:=public.v4_fraction_numeric(NEW.exact_components->>'Q'); o:=public.v4_fraction_numeric(NEW.exact_components->>'O'); j:=public.v4_fraction_numeric(NEW.exact_components->>'J'); a:=public.v4_fraction_numeric(NEW.exact_components->>'A');
 IF NEW.reliability<>r OR NEW.quality<>q OR NEW.responsiveness<>o OR NEW.recent_jobs<>j OR NEW.availability<>a OR NEW.total<>public.v4_exact_total(NEW.exact_components) THEN RAISE EXCEPTION 'V4 exact components/total mismatch'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_check_calculation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_check_calculation() TO service_role;
CREATE TRIGGER v4_calculation_integrity BEFORE INSERT ON public.v4_score_calculations FOR EACH ROW EXECUTE FUNCTION public.v4_check_calculation();

-- Even direct service writes cannot point backward or detach as_of/revision from history.
CREATE FUNCTION public.v4_check_projection_order() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.worker_id::text || ':' || NEW.formula_id::text,0));
 IF EXISTS(SELECT 1 FROM public.v4_score_calculations c WHERE c.worker_id=NEW.worker_id AND c.formula_id=NEW.formula_id AND (c.as_of,c.calculation_revision)>(NEW.as_of,NEW.calculation_revision)) THEN RAISE EXCEPTION 'V4 projection must reference latest history'; END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.worker_id<>OLD.worker_id OR NEW.formula_id<>OLD.formula_id OR (NEW.as_of,NEW.calculation_revision)<(OLD.as_of,OLD.calculation_revision) THEN RAISE EXCEPTION 'V4 projection cannot move backward'; END IF;
   IF (NEW.as_of,NEW.calculation_revision)=(OLD.as_of,OLD.calculation_revision) AND NEW.calculation_id<>OLD.calculation_id THEN RAISE EXCEPTION 'V4 same position different calculation'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_check_projection_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_check_projection_order() TO service_role;
CREATE TRIGGER v4_projection_order BEFORE INSERT OR UPDATE ON public.v4_worker_scores FOR EACH ROW EXECUTE FUNCTION public.v4_check_projection_order();

CREATE INDEX v4_outcome_worker_time ON public.v4_assignment_outcomes(worker_id,occurred_at);
CREATE INDEX v4_offer_worker_time ON public.v4_offer_opportunities(worker_id,valid_from);
CREATE INDEX v4_availability_worker_time ON public.v4_availability_intervals(worker_id,starts_at);
CREATE INDEX v4_calculation_worker_time ON public.v4_score_calculations(worker_id,as_of DESC);
-- Transaction adapter must insert history and publish in ONE outer transaction.
-- Not SECURITY DEFINER: caller must already have restricted service privileges.
CREATE FUNCTION public.v4_publish_calculation(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c public.v4_score_calculations;
BEGIN
 SELECT * INTO STRICT c FROM public.v4_score_calculations WHERE id=p_id;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.worker_id::text || ':' || c.formula_id::text,0));
 IF EXISTS (SELECT 1 FROM public.v4_worker_scores s WHERE s.worker_id=c.worker_id AND s.formula_id=c.formula_id AND (s.as_of,s.calculation_revision)>=(c.as_of,c.calculation_revision)) THEN
   RETURN false; -- Equal replay or stale tuple, not a newer correction.
 END IF;
 INSERT INTO public.v4_worker_scores(worker_id,formula_id,calculation_id,as_of,calculation_revision)
 VALUES(c.worker_id,c.formula_id,c.id,c.as_of,c.calculation_revision)
 ON CONFLICT(worker_id,formula_id) DO UPDATE SET calculation_id=excluded.calculation_id,as_of=excluded.as_of,calculation_revision=excluded.calculation_revision,stale=false;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.v4_publish_calculation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_publish_calculation(uuid) TO service_role;
CREATE FUNCTION public.v4_publish_inserted_calculation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.v4_publish_calculation(NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_publish_inserted_calculation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_publish_inserted_calculation() TO service_role;
CREATE TRIGGER v4_atomic_publish AFTER INSERT ON public.v4_score_calculations FOR EACH ROW EXECUTE FUNCTION public.v4_publish_inserted_calculation();
COMMIT;
