-- READ-ONLY BACKUP. DO NOT EXECUTE.
-- Exported 2026-11-07 03:40 UTC via pg_get_functiondef from live project paywwbuqycovjopryele.
-- Execute privilege (proacl): {postgres=X/postgres,service_role=X/postgres}

CREATE OR REPLACE FUNCTION public.accept_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_worker_id uuid;
BEGIN
  IF v_auth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT id INTO v_worker_id FROM public.workers
   WHERE user_id::text = v_auth::text OR id = v_auth LIMIT 1;
  IF v_worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker not found');
  END IF;
  PERFORM 1 FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.booking_requests
                  WHERE booking_id = p_booking_id AND worker_id = v_worker_id
                    AND status IN ('pending','sent','queued')
                    AND timeout_at > now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active offer for this booking');
  END IF;
  RETURN public.accept_booking_authoritative(p_booking_id, NULL);
END $function$;
