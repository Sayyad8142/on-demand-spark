CREATE OR REPLACE FUNCTION public.get_eligible_workers(p_service text, p_community text, p_limit integer DEFAULT 50)
 RETURNS TABLE(worker_id uuid, full_name text, photo_url text, rating_avg numeric, rating_count integer, completed_bookings_count integer, last_seen_at timestamp with time zone, is_fresh boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dow  int;
  v_slot text;
  v_fresh_threshold interval := '10 minutes';
  v_stale_threshold interval := '30 minutes';
BEGIN
  -- Timezone-aware slotting
  v_dow := (extract(dow FROM now() AT TIME ZONE 'Asia/Kolkata')::int + 6) % 7;
  v_slot := to_char(
    date_trunc('hour', now() AT TIME ZONE 'Asia/Kolkata')
    + interval '30 min'
      * floor(extract(minute FROM now() AT TIME ZONE 'Asia/Kolkata') / 30),
    'HH24:MI:SS'
  );

  RETURN QUERY
  SELECT
    w.id                                            AS worker_id,
    w.full_name,
    w.photo_url,
    COALESCE(w.rating, 5.0)                         AS rating_avg,
    COALESCE(w.total_ratings, 0)::int               AS rating_count,
    COALESCE(w.total_bookings_completed, 0)::int    AS completed_bookings_count,
    w.last_seen_at,
    (w.last_seen_at > now() - v_fresh_threshold)    AS is_fresh
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  WHERE w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
    AND COALESCE(w.is_blocked, false) = false
    AND w.fcm_token IS NOT NULL
    AND p_service = ANY(w.service_types)
    AND p_community = ANY(w.communities)
    AND wa.day_of_week = v_dow
    AND v_slot = ANY(wa.slots)
    -- Heartbeat gate (fresh or stale)
    AND w.last_seen_at > now() - v_stale_threshold
  ORDER BY
    (w.last_seen_at > now() - v_fresh_threshold) DESC, -- Fresh first
    COALESCE(w.rating, 5.0) DESC,
    w.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;
