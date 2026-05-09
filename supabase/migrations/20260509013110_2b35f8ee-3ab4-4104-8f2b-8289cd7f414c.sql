CREATE OR REPLACE FUNCTION public.increment_worker_failure(_worker_id uuid, _cooldown_until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.workers
  SET consecutive_delivery_failures = COALESCE(consecutive_delivery_failures, 0) + 1,
      dispatch_cooldown_until = _cooldown_until
  WHERE id = _worker_id;
END;
$$;