-- Add RLS policy to allow workers to see their assigned bookings
CREATE POLICY "workers_can_see_assigned_bookings"
ON public.bookings
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND worker_id = auth.uid()
);