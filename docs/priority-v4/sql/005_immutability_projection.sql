-- DRAFT ONLY: hard immutability, no scheduler or legacy triggers.
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
 IF EXISTS (SELECT 1 FROM public.v4_worker_scores s WHERE s.worker_id=c.worker_id AND s.formula_id=c.formula_id AND s.as_of>=c.as_of) THEN
   RETURN false; -- Same-as-of corrections need a separately reviewed monotonic revision contract.
 END IF;
 INSERT INTO public.v4_worker_scores(worker_id,formula_id,calculation_id,as_of)
 VALUES(c.worker_id,c.formula_id,c.id,c.as_of)
 ON CONFLICT(worker_id,formula_id) DO UPDATE SET calculation_id=excluded.calculation_id,as_of=excluded.as_of,stale=false;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.v4_publish_calculation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v4_publish_calculation(uuid) TO service_role;
COMMIT;
