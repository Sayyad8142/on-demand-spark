
-- 1) Atomic manual availability setter (source attribution + clears stale watchdog pause)
CREATE OR REPLACE FUNCTION public.set_worker_availability_manual(
  p_worker_id uuid,
  p_is_available boolean,
  p_source text DEFAULT 'worker',
  p_reason text DEFAULT 'manual_toggle'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows int;
  v_source text := lower(coalesce(nullif(p_source,''), 'worker'));
BEGIN
  IF v_source NOT IN ('worker','admin') THEN
    v_source := 'worker';
  END IF;

  PERFORM set_config('app.availability_source', v_source, true);
  PERFORM set_config('app.availability_reason', coalesce(nullif(p_reason,''), 'manual_toggle'), true);

  UPDATE public.workers
     SET is_available = p_is_available,
         last_active_at = now(),
         updated_at = now(),
         auto_paused_at = NULL,
         auto_paused_reason = NULL,
         auto_paused_source = NULL
   WHERE id = p_worker_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  PERFORM set_config('app.availability_source', '', true);
  PERFORM set_config('app.availability_reason', '', true);

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'worker_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'worker_id', p_worker_id, 'is_available', p_is_available, 'source', v_source);
END;
$$;

REVOKE ALL ON FUNCTION public.set_worker_availability_manual(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_worker_availability_manual(uuid, boolean, text, text) TO service_role;

-- 2) Manual toggle via authenticated RPC also attributes source correctly
CREATE OR REPLACE FUNCTION public.update_worker_availability(p_is_available boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_worker_id uuid;
BEGIN
  v_worker_id := auth.uid();
  IF v_worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  RETURN public.set_worker_availability_manual(v_worker_id, p_is_available, 'worker', 'manual_toggle');
END;
$$;

-- 3) Disable the 48h auto re-enable behaviour (keep function as a no-op for callers)
CREATE OR REPLACE FUNCTION public.auto_enable_stale_offline_workers()
RETURNS TABLE(worker_id uuid, hours_offline numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- DISABLED: a manual OFF must never expire. Workers stay offline until they
  -- explicitly go online again. Kept as a no-op so existing callers do not error.
  RETURN;
END;
$$;
