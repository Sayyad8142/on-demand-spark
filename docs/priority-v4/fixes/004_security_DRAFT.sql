-- DRAFT ONLY. NOT EXECUTED. Isolated test project only; abort if project ref = paywwbuqycovjopryele.
-- Builds on 003 (guard trigger aa_guard_worker_score_columns). Live scores/dispatch untouched.
BEGIN;

-- 1. Sensitive worker fields: trigger in 003 blocks anon/authenticated changes on INSERT/UPDATE,
--    regardless of path (REST, RPC invoker functions, realtime). Normal profile fields
--    (name, photo, UPI, availability, tokens) stay editable under workers_update_own.
--    Remove anon table rights entirely - workers are always signed in.
REVOKE INSERT, UPDATE, DELETE ON public.workers FROM anon;

-- 2. Rating override: verified admin only, and audited.
CREATE TABLE IF NOT EXISTS public.worker_score_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL, field text NOT NULL, old_value numeric, new_value numeric,
  actor uuid, reason text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.worker_score_audit TO authenticated;
GRANT ALL ON public.worker_score_audit TO service_role;
ALTER TABLE public.worker_score_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read score audit" ON public.worker_score_audit FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_set_worker_rating(p_worker_id uuid, p_rating numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_worker_id IS NULL OR p_rating IS NULL OR p_rating < 0 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid input'; END IF;
  SELECT admin_override_rating INTO v_old FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found'; END IF;
  PERFORM set_config('app.score_writer','on', true);
  UPDATE workers SET admin_override_rating = ROUND(p_rating,2) WHERE id = p_worker_id;
  INSERT INTO worker_score_audit(worker_id, field, old_value, new_value, actor)
  VALUES (p_worker_id, 'admin_override_rating', v_old, ROUND(p_rating,2), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_worker_rating(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_worker_rating(uuid, numeric) TO authenticated; -- is_admin() inside
-- Same pattern for admin_clear_worker_rating.

-- 3. Rating recalculation: server-only. Called by the ratings trigger, which runs as owner.
ALTER FUNCTION public.recalc_worker_rating(uuid) SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.recalc_worker_rating(uuid) FROM PUBLIC, anon, authenticated;
-- Body must add: PERFORM set_config('app.score_writer','on', true); before its UPDATE.
-- Likewise recalc_worker_priority_score_one / recalc_worker_priority_scores (already not executable by clients).

-- 4. Fault events: written only by admin RPC and server triggers; workers read their own.
REVOKE INSERT, UPDATE, DELETE ON public.worker_fault_events FROM anon, authenticated;
REVOKE ALL ON public.worker_fault_events FROM anon;
GRANT SELECT ON public.worker_fault_events TO authenticated;
DROP POLICY IF EXISTS "Admins can insert fault events" ON public.worker_fault_events;
CREATE POLICY "Workers read own fault events" ON public.worker_fault_events FOR SELECT TO authenticated
  USING (worker_id IN (SELECT id FROM workers WHERE user_id = auth.uid()::text OR id = auth.uid()));
-- admin_log_worker_fault (SECURITY DEFINER, is_admin()) keeps inserting; add ON CONFLICT DO NOTHING (003 B).

-- 5. Alternative paths checklist (run in the test project):
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE nspname='public' AND prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
--      AND pg_get_functiondef(p.oid) ~* 'update\s+(public\.)?workers';
--   Each result must either not touch score fields or check is_admin()/session worker.

ROLLBACK;
