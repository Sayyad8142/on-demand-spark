-- ── v3 shadow columns ────────────────────────────────────────────────────────
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS priority_score_v3 numeric,
  ADD COLUMN IF NOT EXISTS priority_score_v3_updated_at timestamptz;

-- ── v3 single-worker recompute ───────────────────────────────────────────────
-- Goals:
--  * Historical completions matter but with diminishing returns (asymptote 30)
--  * Recent (30d) completions matter MORE than old history (asymptote 20)
--  * Recent acceptance rate (30d) up to 10 pts
--  * Recency bonus (last_seen) up to 5 pts
--  * Penalties decay: last 90d full weight, older half weight, total cap 40
--  * No saturation before ~300-500 clean lifetime completions
CREATE OR REPLACE FUNCTION public.recompute_priority_score_v3(p_worker_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_completed_lifetime integer := 0;
  v_completed_30d      integer := 0;
  v_req_30d            integer := 0;
  v_acc_30d            integer := 0;
  v_acceptance         numeric := 0;
  v_last_seen          timestamptz;

  v_cancel_recent      integer := 0;
  v_cancel_old         integer := 0;
  v_anomov_recent      integer := 0;
  v_anomov_old         integer := 0;
  v_noshow_recent      integer := 0;
  v_noshow_old         integer := 0;

  v_completion_hist    numeric := 0;
  v_completion_recent  numeric := 0;
  v_acceptance_pts     numeric := 0;
  v_recency_pts        numeric := 0;
  v_penalty_pts        numeric := 0;
  v_score              numeric := 0;
BEGIN
  IF p_worker_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(last_seen_at, last_active_at) INTO v_last_seen
    FROM public.workers WHERE id = p_worker_id;

  -- Completions
  SELECT count(*) INTO v_completed_lifetime
    FROM public.bookings
   WHERE worker_id = p_worker_id AND status = 'completed';

  SELECT count(*) INTO v_completed_30d
    FROM public.bookings
   WHERE worker_id = p_worker_id
     AND status = 'completed'
     AND completed_at >= now() - interval '30 days';

  -- Acceptance behaviour (30d)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted','rejected','timed_out'))::int,
    COUNT(*) FILTER (WHERE status = 'accepted')::int
  INTO v_req_30d, v_acc_30d
  FROM public.booking_requests
  WHERE worker_id = p_worker_id
    AND created_at >= now() - interval '30 days';

  v_acceptance := CASE WHEN v_req_30d > 0
    THEN v_acc_30d::numeric / v_req_30d::numeric
    ELSE 0 END;

  -- Penalties, split by recency (90d cutoff)
  SELECT
    COUNT(*) FILTER (WHERE updated_at >= now() - interval '90 days')::int,
    COUNT(*) FILTER (WHERE updated_at <  now() - interval '90 days')::int
  INTO v_cancel_recent, v_cancel_old
  FROM public.bookings
  WHERE worker_id = p_worker_id
    AND status = 'cancelled'
    AND accepted_at IS NOT NULL
    AND cancel_source = 'worker';

  SELECT
    COUNT(*) FILTER (WHERE updated_at >= now() - interval '90 days')::int,
    COUNT(*) FILTER (WHERE updated_at <  now() - interval '90 days')::int
  INTO v_anomov_recent, v_anomov_old
  FROM public.bookings
  WHERE worker_id = p_worker_id
    AND accepted_at IS NOT NULL
    AND status = 'cancelled'
    AND COALESCE(cancel_reason,'') IN ('worker_no_movement','no_movement','accepted_no_movement');

  SELECT
    COUNT(*) FILTER (WHERE updated_at >= now() - interval '90 days')::int,
    COUNT(*) FILTER (WHERE updated_at <  now() - interval '90 days')::int
  INTO v_noshow_recent, v_noshow_old
  FROM public.bookings
  WHERE worker_id = p_worker_id
    AND COALESCE(cancel_reason,'') IN ('no_show','worker_no_show');

  -- Component scores
  -- Historical: 30 * (1 - e^(-n/200)). 100 jobs -> ~11.8, 300 -> ~23.3, 500 -> ~27.5, 1000 -> ~29.8
  v_completion_hist   := 30 * (1 - exp(- v_completed_lifetime::numeric / 200.0));
  -- Recent 30d: 20 * (1 - e^(-n/15)). 5 -> 5.7, 15 -> 12.6, 30 -> 17.3, 50 -> 19.3
  v_completion_recent := 20 * (1 - exp(- v_completed_30d::numeric / 15.0));
  v_acceptance_pts    := 10 * v_acceptance;
  v_recency_pts       := CASE
                           WHEN v_last_seen IS NULL THEN 0
                           WHEN v_last_seen > now() - interval '24 hours' THEN 5
                           WHEN v_last_seen > now() - interval '7 days'  THEN 3
                           ELSE 0
                         END;

  -- Penalty weights: cancel_after_accept=3, no_movement=5, no_show=8.
  -- Old (>90d) penalties decay to 30%.
  v_penalty_pts := (v_cancel_recent * 3 + v_anomov_recent * 5 + v_noshow_recent * 8)
                 + 0.3 * (v_cancel_old * 3 + v_anomov_old * 5 + v_noshow_old * 8);
  IF v_penalty_pts > 40 THEN v_penalty_pts := 40; END IF;

  v_score := 50
           + v_completion_hist
           + v_completion_recent
           + v_acceptance_pts
           + v_recency_pts
           - v_penalty_pts;

  IF v_score < 0   THEN v_score := 0;   END IF;
  IF v_score > 100 THEN v_score := 100; END IF;
  v_score := ROUND(v_score, 2);

  UPDATE public.workers
     SET priority_score_v3 = v_score,
         priority_score_v3_updated_at = now()
   WHERE id = p_worker_id;

  RETURN v_score;
END;
$function$;

-- ── v3 batch recompute (ALL workers) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_all_priority_scores_v3()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN SELECT id FROM public.workers LOOP
    PERFORM public.recompute_priority_score_v3(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ── Admin-only comparison view function ──────────────────────────────────────
-- Returns one row per worker with v2/v3 scores and dense ranks (by score desc).
CREATE OR REPLACE FUNCTION public.get_priority_shadow_comparison()
RETURNS TABLE (
  worker_id uuid,
  full_name text,
  community text,
  is_active boolean,
  completed_bookings bigint,
  score_v2 numeric,
  score_v3 numeric,
  diff numeric,
  rank_v2 bigint,
  rank_v3 bigint,
  rank_change bigint,
  v3_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      w.id AS worker_id,
      w.full_name,
      w.community,
      w.is_active,
      (SELECT COUNT(*) FROM public.bookings b
        WHERE b.worker_id = w.id AND b.status = 'completed') AS completed_bookings,
      w.priority_score AS score_v2,
      w.priority_score_v3 AS score_v3,
      w.priority_score_v3_updated_at AS v3_updated_at
    FROM public.workers w
  ),
  ranked AS (
    SELECT b.*,
      DENSE_RANK() OVER (ORDER BY COALESCE(b.score_v2, -1) DESC) AS rank_v2,
      DENSE_RANK() OVER (ORDER BY COALESCE(b.score_v3, -1) DESC) AS rank_v3
    FROM base b
  )
  SELECT
    r.worker_id,
    r.full_name,
    r.community,
    r.is_active,
    r.completed_bookings,
    r.score_v2,
    r.score_v3,
    COALESCE(r.score_v3, 0) - COALESCE(r.score_v2, 0) AS diff,
    r.rank_v2,
    r.rank_v3,
    (r.rank_v2 - r.rank_v3) AS rank_change,
    r.v3_updated_at
  FROM ranked r
  ORDER BY r.rank_v3 ASC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_priority_shadow_comparison() TO authenticated, service_role;

-- ── Initial backfill so admin page has data immediately ──────────────────────
SELECT public.recompute_all_priority_scores_v3();