-- Add acceptance rate column
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS acceptance_rate_7d numeric DEFAULT 0;

-- Updated single-worker recalc with balanced 0-100 formula
CREATE OR REPLACE FUNCTION public.recalc_worker_priority_score_one(p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_completed_7d integer;
  v_not_reached_7d integer;
  v_worker_fault_7d integer;
  v_effective_rating numeric;
  v_online_hours numeric;
  v_last_seen timestamptz;
  v_total_req integer;
  v_accepted_req integer;
  v_acceptance numeric;
  v_completion_pts numeric;
  v_online_pts numeric;
  v_rating_pts numeric;
  v_recency_pts numeric;
  v_bucket_pts numeric;
  v_penalty_pts numeric;
  v_final numeric;
  v_score numeric;
  v_bucket text;
  v_reason text;
BEGIN
  IF p_worker_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(admin_override_rating, rating, 0),
         COALESCE(last_7_days_online_hours, 0),
         COALESCE(last_seen_at, last_active_at)
    INTO v_effective_rating, v_online_hours, v_last_seen
  FROM workers WHERE id = p_worker_id;

  SELECT COUNT(*)::int INTO v_completed_7d
  FROM bookings WHERE worker_id = p_worker_id
    AND status = 'completed' AND completed_at >= now() - interval '7 days';

  SELECT COUNT(*)::int INTO v_not_reached_7d
  FROM worker_reach_events WHERE worker_id = p_worker_id
    AND reach_outcome = 'not_reached' AND created_at >= now() - interval '7 days';

  SELECT COUNT(*)::int INTO v_worker_fault_7d
  FROM worker_fault_events WHERE worker_id = p_worker_id
    AND created_at >= now() - interval '7 days';

  -- Acceptance rate (last 7 days)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted','rejected','timed_out'))::int,
    COUNT(*) FILTER (WHERE status = 'accepted')::int
  INTO v_total_req, v_accepted_req
  FROM booking_requests
  WHERE worker_id = p_worker_id
    AND created_at >= now() - interval '7 days';

  v_acceptance := CASE WHEN v_total_req > 0
    THEN ROUND((v_accepted_req::numeric / v_total_req) * 100, 2)
    ELSE 0 END;

  -- Points
  v_completion_pts := LEAST(v_completed_7d * 5, 40);
  v_online_pts    := LEAST(v_online_hours * 0.4, 20);
  v_rating_pts    := (v_effective_rating / 5.0) * 25;
  v_recency_pts   := CASE WHEN v_last_seen > now() - interval '24 hours' THEN 5 ELSE 0 END;
  v_bucket_pts    := CASE WHEN v_effective_rating >= 4.5 THEN 10 ELSE 0 END;
  v_penalty_pts   := (v_not_reached_7d * 5) + (v_worker_fault_7d * 20);

  v_final := v_completion_pts + v_online_pts + v_rating_pts + v_recency_pts + v_bucket_pts - v_penalty_pts;
  v_score := GREATEST(0, LEAST(100, v_final));

  v_bucket := CASE WHEN v_effective_rating >= 4.5 THEN 'top' ELSE 'below_4_5' END;

  v_reason := 'completed_7d=' || v_completed_7d
           || ' online_h=' || ROUND(v_online_hours,1)
           || ' rating=' || ROUND(v_effective_rating,2)
           || ' accept%=' || v_acceptance
           || ' not_reached=' || v_not_reached_7d
           || ' fault=' || v_worker_fault_7d
           || ' bucket=' || v_bucket
           || ' pts(c/o/r/rec/b/pen)=' || ROUND(v_completion_pts,1) || '/' || ROUND(v_online_pts,1) || '/' || ROUND(v_rating_pts,1) || '/' || v_recency_pts || '/' || v_bucket_pts || '/' || v_penalty_pts
           || ' final=' || ROUND(v_score,2);

  UPDATE workers
  SET priority_score = ROUND(v_score,2),
      last_7_days_completed_bookings = v_completed_7d,
      not_reached_7d = v_not_reached_7d,
      admin_fault_7d = v_worker_fault_7d,
      acceptance_rate_7d = v_acceptance,
      rating_bucket = v_bucket,
      priority_score_updated_at = now(),
      score_reason = v_reason
  WHERE id = p_worker_id;
END;
$function$;

-- Bulk recalc reuses single-worker function for consistency
CREATE OR REPLACE FUNCTION public.recalc_worker_priority_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
BEGIN
  FOR w IN SELECT id FROM workers WHERE is_active = true LOOP
    PERFORM public.recalc_worker_priority_score_one(w.id);
  END LOOP;
END;
$function$;

-- Backfill all workers immediately
SELECT public.recalc_worker_priority_scores();