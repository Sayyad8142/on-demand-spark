DROP POLICY IF EXISTS "Admins can manage communities" ON public.communities;
DROP POLICY IF EXISTS "admin_write_communities" ON public.communities;

CREATE POLICY "Admins can manage communities"
ON public.communities
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON public.communities TO anon;
GRANT SELECT ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;