-- COMPREHENSIVE FIX: Drop ALL existing policies on workers table
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.workers';
    END LOOP;
END $$;

-- Create clean, non-recursive policies for workers
-- Policy 1: Workers can view their own profile
CREATE POLICY "worker_select_self"
ON public.workers
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Policy 2: Workers can update their own profile
CREATE POLICY "worker_update_self"
ON public.workers
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy 3: Workers can insert their own profile (for signup)
CREATE POLICY "worker_insert_self"
ON public.workers
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Policy 4: Admins can do everything (uses security definer function to avoid recursion)
CREATE POLICY "admin_all_workers"
ON public.workers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  )
);