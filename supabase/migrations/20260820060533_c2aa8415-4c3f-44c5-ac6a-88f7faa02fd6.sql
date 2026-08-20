
GRANT ALL ON FUNCTION public.worker_phone_exists(text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.ensure_worker_profile() TO authenticated, service_role;
