-- DRAFT ONLY. NOT EXECUTED. Target: isolated test project only (never paywwbuqycovjopryele).
-- Supersedes the scoring part of 001. Writes a SHADOW column; live priority_score is untouched.
BEGIN;

-- A. New workers start at 25 (existing rows untouched; real 0 stays 0).
ALTER TABLE public.workers ALTER COLUMN priority_score SET DEFAULT 25;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS priority_score_v4 numeric;        -- shadow, NULL until computed
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS priority_score_v4_as_of timestamptz;

-- B. One penalty per incident. Existing duplicate (1 pair, worker_refused) is NOT deleted;
--    the index is partial-unique only for rows created after the cutover timestamp.
CREATE UNIQUE INDEX IF NOT EXISTS worker_fault_events_one_per_incident
  ON public.worker_fault_events (worker_id, booking_id, reason_code)
  WHERE booking_id IS NOT NULL AND created_at >= TIMESTAMPTZ '2026-11-01 00:00+00'; -- set at approval
-- admin_log_worker_fault: change INSERT to ... ON CONFLICT DO NOTHING RETURNING id (return existing id if null).

-- C. Deterministic 30-day formula (mirrors docs/priority-v4/fixes/formula30d.ts).
CREATE OR REPLACE FUNCTION public.compute_priority_score_v4(p_worker_id uuid, p_as_of timestamptz)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (SELECT COALESCE(admin_override_rating, rating) r, COALESCE(total_ratings,0) n FROM workers WHERE id = p_worker_id),
  jobs AS (SELECT count(*) c FROM bookings WHERE worker_id = p_worker_id AND status = 'completed'
           AND completed_at > p_as_of - interval '30 days' AND completed_at <= p_as_of),
  inc AS (SELECT DISTINCT ON (COALESCE(booking_id::text, 'event:'||id::text), reason_code) reason_code
          FROM worker_fault_events WHERE worker_id = p_worker_id
           AND created_at > p_as_of - interval '30 days' AND created_at <= p_as_of
           AND reason_code IN ('worker_no_show','no_movement','worker_cancelled','complaint_verified')),
  pen AS (SELECT COALESCE(sum(CASE reason_code WHEN 'worker_no_show' THEN 20 WHEN 'no_movement' THEN 15 ELSE 10 END),0) p FROM inc)
  SELECT GREATEST(0, LEAST(100, 25 + jobs.c + CASE WHEN w.r >= 4.8 AND w.n >= 5 THEN 5 ELSE 0 END - pen.p))
  FROM w, jobs, pen;
$$;
REVOKE ALL ON FUNCTION public.compute_priority_score_v4(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_priority_score_v4(uuid, timestamptz) TO service_role;

-- D. Workers cannot change score/rating through ANY path they can reach.
--    Today anon+authenticated hold table UPDATE on workers and INSERT on worker_fault_events.
CREATE OR REPLACE FUNCTION public.guard_worker_score_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- session_user/auth role check: definer functions do not bypass this unless allow-listed
  IF auth.role() IN ('anon','authenticated') AND NOT public.is_admin()
     AND current_setting('app.score_writer', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.priority_score := 25; NEW.rating := NULL; NEW.admin_override_rating := NULL;
      NEW.priority_score_v4 := NULL;
    ELSIF NEW.priority_score IS DISTINCT FROM OLD.priority_score
       OR NEW.priority_score_v4 IS DISTINCT FROM OLD.priority_score_v4
       OR NEW.priority_score_updated_at IS DISTINCT FROM OLD.priority_score_updated_at
       OR NEW.score_reason IS DISTINCT FROM OLD.score_reason
       OR NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.total_ratings IS DISTINCT FROM OLD.total_ratings
       OR NEW.admin_override_rating IS DISTINCT FROM OLD.admin_override_rating THEN
      RAISE EXCEPTION 'score fields are server-managed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_guard_worker_score_columns ON public.workers;
CREATE TRIGGER aa_guard_worker_score_columns BEFORE INSERT OR UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_score_columns();
-- Approved server writers (recalc_worker_priority_score_one, recalc_worker_rating via rating trigger)
-- must run `SET LOCAL app.score_writer = 'on'` inside their own body.

REVOKE INSERT, UPDATE, DELETE ON public.worker_fault_events FROM anon, authenticated; -- admins go via RPC
REVOKE EXECUTE ON FUNCTION public.recalc_worker_rating(uuid) FROM PUBLIC, anon, authenticated;
-- admin_set_worker_rating has NO is_admin() check: add `IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;`
-- and log to app_config_audit (or a new score-audit table) for every admin adjustment.

-- E. Shadow fill (test project only). Live priority_score and dispatch are NOT touched.
-- UPDATE workers SET priority_score_v4 = compute_priority_score_v4(id, TIMESTAMPTZ '<fixed as_of>'),
--        priority_score_v4_as_of = TIMESTAMPTZ '<fixed as_of>';  -- run with app.score_writer=on

-- F. Duplicate review query (read-only):
-- SELECT worker_id, booking_id, reason_code, count(*) FROM worker_fault_events
--  WHERE booking_id IS NOT NULL GROUP BY 1,2,3 HAVING count(*) > 1;

ROLLBACK; -- COMMIT only in the approved isolated test project
