-- RLS Hardening for bookings table
-- Restrict visibility: workers only see assigned bookings or pending bookings they have an active request for.

ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workers can view available or assigned bookings" ON public.bookings;
DROP POLICY IF EXISTS "Workers can view targeted or assigned bookings" ON public.bookings;
DROP POLICY IF EXISTS "workers_see_matching_pending" ON public.bookings;
DROP POLICY IF EXISTS "workers_can_see_matching_pending_bookings" ON public.bookings;

CREATE POLICY "Workers can view targeted or assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  (
    status = 'pending' AND EXISTS (
      SELECT 1 FROM public.booking_requests br
      WHERE br.booking_id = bookings.id
      AND br.worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()::text)
      AND br.timeout_at > now()
    )
  )
  OR 
  worker_id IN (
    SELECT id FROM public.workers WHERE user_id = auth.uid()::text
  )
);

-- Grant select to authenticated role
GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
