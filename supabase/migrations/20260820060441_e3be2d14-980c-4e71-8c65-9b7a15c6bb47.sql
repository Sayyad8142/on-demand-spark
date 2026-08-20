
CREATE OR REPLACE FUNCTION public.worker_phone_exists(_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.worker_phone_exists(text) TO anon, authenticated;

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
    SELECT phone INTO v_user_phone FROM auth.users WHERE id = v_auth_uid;
    
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

GRANT EXECUTE ON FUNCTION public.ensure_worker_profile() TO authenticated;
