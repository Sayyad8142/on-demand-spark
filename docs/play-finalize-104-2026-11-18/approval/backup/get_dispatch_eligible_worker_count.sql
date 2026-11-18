CREATE OR REPLACE FUNCTION public.get_dispatch_eligible_worker_count(p_service text, p_community text, p_day smallint DEFAULT NULL::smallint, p_slot text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH v AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata') AS ist),
  p AS (
    SELECT COALESCE(p_day, EXTRACT(DOW FROM ist)::smallint) AS d,
      CASE WHEN p_slot IS NULL THEN
        to_char(date_trunc('hour', ist) + (CASE WHEN EXTRACT(MINUTE FROM ist) >= 30 THEN interval '30 min' ELSE interval '0' END), 'HH24:MI:00')
      ELSE lpad(split_part(p_slot, ':', 1), 2, '0') || ':' ||
        CASE WHEN COALESCE(NULLIF(split_part(p_slot, ':', 2), ''), '0')::int >= 30 THEN '30' ELSE '00' END || ':00'
      END AS s
    FROM v)
  SELECT count(*)::int FROM workers w, p
  WHERE w.is_active AND w.is_available AND w.is_busy = false AND w.is_blocked = false
    AND w.fcm_token IS NOT NULL
    AND public.worker_connection_fresh(w.last_heartbeat_at, w.last_seen_at)
    AND w.communities @> ARRAY[p_community] AND w.service_types @> ARRAY[p_service]
    AND EXISTS (SELECT 1 FROM worker_availability wa WHERE wa.worker_id = w.id AND wa.day_of_week = p.d AND p.s = ANY(wa.slots));
$function$;
