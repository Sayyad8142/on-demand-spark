CREATE OR REPLACE FUNCTION public.worker_approval_allows_online(p_status text, p_requires boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(p_status,'pending_approval') = 'approved'
      OR (coalesce(p_requires, true) = false AND coalesce(p_status,'pending_approval') <> 'rejected')
$function$;
