-- Replace ensure_worker_profile() safely by dropping existing signature first
DROP FUNCTION IF EXISTS public.ensure_worker_profile();

CREATE FUNCTION public.ensure_worker_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uid_text text := auth.uid()::text;
  v_existing_id uuid;
  v_phone_raw text;
  v_phone text;
  v_full_name text;
  v_service_types text[];
  v_communities text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find existing worker either linked by user_id or legacy id==auth.uid
  SELECT w.id
  INTO v_existing_id
  FROM public.workers w
  WHERE w.user_id = v_uid_text OR w.id = v_uid
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Ensure linkage
    UPDATE public.workers
    SET user_id = v_uid_text,
        updated_at = now()
    WHERE id = v_existing_id
      AND (user_id IS DISTINCT FROM v_uid_text);

    RETURN json_build_object('success', true, 'worker_id', v_existing_id, 'created', false);
  END IF;

  -- Pull phone + metadata from the JWT
  v_phone_raw := NULLIF(COALESCE(auth.jwt() ->> 'phone', ''), '');
  v_phone := CASE
    WHEN v_phone_raw IS NULL THEN NULL
    WHEN left(v_phone_raw, 1) = '+' THEN v_phone_raw
    ELSE '+' || v_phone_raw
  END;

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Phone missing in auth token';
  END IF;

  v_full_name := NULLIF(COALESCE(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), '');
  IF v_full_name IS NULL THEN
    v_full_name := 'Worker';
  END IF;

  -- service_types from metadata (json array) -> text[]
  SELECT COALESCE(array_agg(x), '{}'::text[])
  INTO v_service_types
  FROM (
    SELECT jsonb_array_elements_text(COALESCE(auth.jwt() -> 'user_metadata' -> 'service_types', '[]'::jsonb)) AS x
  ) s;

  -- communities from metadata (json array) -> text[]
  SELECT COALESCE(array_agg(x), '{}'::text[])
  INTO v_communities
  FROM (
    SELECT jsonb_array_elements_text(COALESCE(auth.jwt() -> 'user_metadata' -> 'communities', '[]'::jsonb)) AS x
  ) c;

  INSERT INTO public.workers (
    id,
    user_id,
    phone,
    full_name,
    service_types,
    communities,
    is_active,
    is_available,
    is_busy
  )
  VALUES (
    v_uid,
    v_uid_text,
    v_phone,
    v_full_name,
    v_service_types,
    NULLIF(v_communities, '{}'::text[]),
    true,
    false,
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      phone = EXCLUDED.phone,
      full_name = EXCLUDED.full_name,
      service_types = EXCLUDED.service_types,
      communities = EXCLUDED.communities,
      updated_at = now();

  RETURN json_build_object('success', true, 'worker_id', v_uid, 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_worker_profile() TO authenticated;
