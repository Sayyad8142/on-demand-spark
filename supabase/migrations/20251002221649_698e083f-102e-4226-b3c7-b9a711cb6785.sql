-- Drop existing policies if they exist
DROP POLICY IF EXISTS "workers_select_own" ON public.workers;
DROP POLICY IF EXISTS "workers_update_own_status" ON public.workers;

-- Add RLS policy for workers to select their own data
CREATE POLICY "workers_select_own" 
ON public.workers 
FOR SELECT 
USING (id = auth.uid());

-- Add RLS policy for workers to update their own availability and status
CREATE POLICY "workers_update_own_status" 
ON public.workers 
FOR UPDATE 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());