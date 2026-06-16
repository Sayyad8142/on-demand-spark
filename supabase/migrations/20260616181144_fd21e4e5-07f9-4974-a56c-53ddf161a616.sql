-- Issue 1 fix: Priority scores should reflect historical worker quality, not current availability.
-- 1) Remove is_active filter from bulk recompute functions
-- 2) Auto-recompute when a worker transitions inactive -> active

CREATE OR REPLACE FUNCTION public.recompute_all_priority_scores_v2()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  -- Recompute for ALL workers (active and inactive). Priority score reflects
  -- lifetime performance, not current availability.
  FOR r IN SELECT id FROM public.workers LOOP
    PERFORM public.recompute_priority_score_v2(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_worker_priority_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
BEGIN
  -- Recompute for all workers, not just active ones.
  FOR w IN SELECT id FROM public.workers LOOP
    PERFORM public.recompute_priority_score_v2(w.id);
  END LOOP;
END;
$function$;

-- Trigger: when a worker flips from inactive -> active, recompute their score
-- so they re-enter dispatch ranking with an up-to-date number.
CREATE OR REPLACE FUNCTION public.trg_recompute_score_on_reactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.is_active, false) = false AND COALESCE(NEW.is_active, false) = true THEN
    PERFORM public.recompute_priority_score_v2(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS workers_recompute_score_on_reactivate ON public.workers;
CREATE TRIGGER workers_recompute_score_on_reactivate
AFTER UPDATE OF is_active ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_score_on_reactivate();

-- One-time backfill so previously stale inactive workers (e.g. 7ef6828f-...) refresh now.
SELECT public.recompute_all_priority_scores_v2();