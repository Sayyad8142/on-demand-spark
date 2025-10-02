-- Drop and recreate update_worker_availability with better error handling
DROP FUNCTION IF EXISTS public.update_worker_availability(boolean);

CREATE FUNCTION public.update_worker_availability(p_is_available boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_worker_id uuid;
  v_rows_updated int;
BEGIN
  -- Get authenticated user ID
  v_worker_id := auth.uid();
  
  IF v_worker_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Update worker availability
  UPDATE workers 
  SET is_available = p_is_available,
      last_active_at = now(),
      updated_at = now()
  WHERE id = v_worker_id;
  
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Worker not found'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'worker_id', v_worker_id,
    'is_available', p_is_available
  );
END;
$$;