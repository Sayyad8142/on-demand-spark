-- Create a helper function to ensure the logged-in user has a worker row
-- Uses auth.jwt() claims (phone + user_metadata) captured during OTP sign-up.

CREATE OR REPLACE FUNCTION public.ensure_worker_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_meta jsonb := COALESCE(v_jwt->'user_metadata', '{}'::jsonb);
  v_phone text := COALESCE(v_jwt->>'phone', '');
  v_full_name text := NULLIF(TRIM(COALESCE(v_meta->>'full_name', '')), '');
  v_upi_id text := NULLIF(TRIM(COALESCE(v_meta->>'upi_id', '')), '');
  v_service_types text[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_meta->'service_types','[]'::jsonb))), ARRAY[]::text[]);
  v_communities text[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_meta->'communities','[]'::jsonb))), ARRAY[]::text[]);
  v_primary_community text := NULL;
  v_selected_community_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- If already exists (either modern or legacy link), do nothing.
  IF EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = v_uid OR w.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('success', true, 'status', 'exists');
  END IF;

  -- Normalize phone to E.164-ish (+91...) if Supabase provides without +
  IF v_phone ~ '^91\d{10}$' THEN
    v_phone := '+' || v_phone;
  ELSIF v_phone ~ '^\d{10}$' THEN
    v_phone := '+91' || v_phone;
  END IF;

  IF array_length(v_communities, 1) > 0 THEN
    v_primary_community := v_communities[1];
  END IF;

  IF v_primary_community IS NOT NULL THEN
    SELECT c.id
      INTO v_selected_community_id
      FROM public.communities c
     WHERE c.value = v_primary_community
     LIMIT 1;
  END IF;

  INSERT INTO public.workers (
    id,
    user_id,
    full_name,
    phone,
    upi_id,
    service_types,
    communities,
    selected_community_id,
    cook_cuisine_tags,
    is_active,
    is_available,
    is_busy
  ) VALUES (
    v_uid,
    v_uid,
    COALESCE(v_full_name, 'Worker'),
    NULLIF(v_phone, ''),
    v_upi_id,
    v_service_types,
    v_communities,
    v_selected_community_id,
    ARRAY[]::text[],
    true,
    false,
    false
  );

  RETURN jsonb_build_object('success', true, 'status', 'created');
END;
$$;

-- Lock down execution
REVOKE ALL ON FUNCTION public.ensure_worker_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_worker_profile() TO authenticated;
