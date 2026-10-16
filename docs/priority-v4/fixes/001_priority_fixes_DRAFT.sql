-- DRAFT ONLY. NOT EXECUTED. Review + run in an isolated test project first.
-- Production ref paywwbuqycovjopryele must NOT be the target.
BEGIN;

-- 1. New workers start at 25 (existing rows untouched; a real 0 stays 0).
ALTER TABLE public.workers ALTER COLUMN priority_score SET DEFAULT 25;

-- 2. One penalty per incident: dedupe key on (booking_id, reason_code).
--    Live data currently has 1 duplicated pair; review it before creating the index.
CREATE UNIQUE INDEX IF NOT EXISTS worker_fault_events_one_per_incident
  ON public.worker_fault_events (worker_id, booking_id, reason_code)
  WHERE booking_id IS NOT NULL;
-- admin_log_worker_fault and trg_refresh_worker_score_on_booking must then use
--   INSERT ... ON CONFLICT (worker_id, booking_id, reason_code) WHERE booking_id IS NOT NULL DO NOTHING

-- 3. Workers cannot write score fields (workers_update_own allows any column today).
CREATE OR REPLACE FUNCTION public.guard_worker_score_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_admin() THEN
    IF NEW.priority_score IS DISTINCT FROM OLD.priority_score
       OR NEW.priority_score_updated_at IS DISTINCT FROM OLD.priority_score_updated_at
       OR NEW.score_reason IS DISTINCT FROM OLD.score_reason
       OR NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.admin_override_rating IS DISTINCT FROM OLD.admin_override_rating THEN
      RAISE EXCEPTION 'score fields are server-managed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_guard_worker_score_columns ON public.workers;
CREATE TRIGGER aa_guard_worker_score_columns BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_score_columns();
-- Same check on INSERT (workers_insert_own) should force priority_score = 25.

-- 4. Scoring formula: NOT changed here. See report section "Decision needed".
ROLLBACK; -- replace with COMMIT only in the approved test environment
