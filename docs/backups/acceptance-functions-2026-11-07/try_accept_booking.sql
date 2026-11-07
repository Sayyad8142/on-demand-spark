-- READ-ONLY BACKUP. DO NOT EXECUTE.
-- Exported 2026-11-07 03:40 UTC via pg_get_functiondef from live project paywwbuqycovjopryele.
-- Execute privilege (proacl): {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}

CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.accept_booking_authoritative(p_booking_id, NULL);
END;
$function$;
