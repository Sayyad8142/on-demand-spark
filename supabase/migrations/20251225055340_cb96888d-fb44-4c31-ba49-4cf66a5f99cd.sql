-- Drop existing policies on worker_availability
DROP POLICY IF EXISTS "Workers can insert own availability" ON public.worker_availability;
DROP POLICY IF EXISTS "Workers can update own availability" ON public.worker_availability;

-- Create new policies that work for workers where id = auth.uid OR user_id = auth.uid
CREATE POLICY "Workers can insert own availability" 
ON public.worker_availability 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers w 
    WHERE w.id = worker_availability.worker_id 
    AND (w.id = auth.uid() OR w.user_id = auth.uid()::text)
  )
);

CREATE POLICY "Workers can update own availability" 
ON public.worker_availability 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM workers w 
    WHERE w.id = worker_availability.worker_id 
    AND (w.id = auth.uid() OR w.user_id = auth.uid()::text)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers w 
    WHERE w.id = worker_availability.worker_id 
    AND (w.id = auth.uid() OR w.user_id = auth.uid()::text)
  )
);

-- Also add a SELECT policy for workers to read their own availability
DROP POLICY IF EXISTS "Workers can read own availability" ON public.worker_availability;
CREATE POLICY "Workers can read own availability" 
ON public.worker_availability 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM workers w 
    WHERE w.id = worker_availability.worker_id 
    AND (w.id = auth.uid() OR w.user_id = auth.uid()::text)
  )
);