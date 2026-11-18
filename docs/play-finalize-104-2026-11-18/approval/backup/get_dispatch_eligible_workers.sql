CREATE OR REPLACE FUNCTION public.get_dispatch_eligible_workers(p_service text, p_community text, p_day smallint DEFAULT NULL::smallint, p_slot text DEFAULT NULL::text)
 RETURNS TABLE(worker_id uuid, full_name text, phone text, last_heartbeat_at timestamp with time zone, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ist timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  v_day smallint := COALESCE(p_day, EXTRACT(DOW FROM v_ist)::smallint);
  v_slot text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres','supabase_admin')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_slot IS NULL THEN
    v_slot := to_char(date_trunc('hour', v_ist) + (CASE WHEN EXTRACT(MINUTE FROM v_ist) >= 30 THEN interval '30 min' ELSE interval '0' END), 'HH24:MI:00');
  ELSE
    v_slot := lpad(split_part(p_slot, ':', 1), 2, '0') || ':' ||
      CASE WHEN COALESCE(NULLIF(split_part(p_slot, ':', 2), ''), '0')::int >= 30 THEN '30' ELSE '00' END || ':00';
  END IF;
  RETURN QUERY
  SELECT w.id, w.full_name, w.phone, w.last_heartbeat_at, w.last_seen_at
  FROM workers w
  WHERE w.is_active AND w.is_available AND w.is_busy = false AND w.is_blocked = false
    AND w.fcm_token IS NOT NULL
    AND public.worker_connection_fresh(w.last_heartbeat_at, w.last_seen_at)
    AND w.communities @> ARRAY[p_community] AND w.service_types @> ARRAY[p_service]
    AND EXISTS (SELECT 1 FROM worker_availability wa WHERE wa.worker_id = w.id AND wa.day_of_week = v_day AND v_slot = ANY(wa.slots))
  ORDER BY w.full_name;
END;
$function$;
