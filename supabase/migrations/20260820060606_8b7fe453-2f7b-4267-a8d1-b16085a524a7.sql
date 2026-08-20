
ALTER TABLE public.workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_select_own" ON public.workers;
CREATE POLICY "workers_select_own"
ON public.workers
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid()::text) 
  OR (id = auth.uid()) 
  OR (regexp_replace(phone, '\D', '', 'g') LIKE '%' || RIGHT(regexp_replace(COALESCE(auth.jwt() ->> 'phone_number', ''), '\D', '', 'g'), 10))
);

DROP POLICY IF EXISTS "workers_update_own" ON public.workers;
CREATE POLICY "workers_update_own"
ON public.workers
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid()::text) 
  OR (id = auth.uid())
)
WITH CHECK (
  (user_id = auth.uid()::text)
);

GRANT ALL ON public.workers TO authenticated, service_role;
GRANT SELECT ON public.workers TO anon;

CREATE OR REPLACE FUNCTION public.worker_phone_exists(_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := regexp_replace(_phone, '\D', '', 'g');
  RETURN EXISTS (
    SELECT 1 FROM public.workers 
    WHERE regexp_replace(phone, '\D', '', 'g') LIKE '%' || RIGHT(v_clean_phone, 10)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_phone_exists(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_worker_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_user_phone text;
  v_worker jsonb;
  v_auth_uid uuid;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT id INTO v_worker_id 
  FROM public.workers 
  WHERE (user_id = v_auth_uid::text OR id = v_auth_uid) 
  LIMIT 1;

  IF v_worker_id IS NULL THEN
    v_user_phone := auth.jwt() ->> 'phone_number';
    
    IF v_user_phone IS NOT NULL AND v_user_phone <> '' THEN
      SELECT id INTO v_worker_id 
      FROM public.workers 
      WHERE regexp_replace(phone, '\D', '', 'g') LIKE '%' || RIGHT(regexp_replace(v_user_phone, '\D', '', 'g'), 10)
      LIMIT 1;
      
      IF v_worker_id IS NOT NULL THEN
        UPDATE public.workers SET user_id = v_auth_uid::text WHERE id = v_worker_id;
      END IF;
    END IF;
  END IF;

  IF v_worker_id IS NOT NULL THEN
    SELECT row_to_json(w)::jsonb INTO v_worker FROM public.workers w WHERE id = v_worker_id;
    RETURN v_worker;
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Account not registered', 
    'code', 'WORKER_NOT_FOUND',
    'auth_uid', v_auth_uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_worker_profile() TO authenticated, service_role;
