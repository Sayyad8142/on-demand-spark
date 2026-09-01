CREATE OR REPLACE FUNCTION public.get_community_types()
RETURNS TABLE (id uuid, name text, value text, community_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.value, COALESCE(c.community_type, 'apartment')::text
  FROM public.communities c
$$;

GRANT EXECUTE ON FUNCTION public.get_community_types() TO anon, authenticated, service_role;