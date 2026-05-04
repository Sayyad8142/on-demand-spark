CREATE OR REPLACE FUNCTION public.worker_phone_exists(_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workers WHERE phone = _phone
  );
$$;

REVOKE ALL ON FUNCTION public.worker_phone_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.worker_phone_exists(text) TO anon, authenticated;