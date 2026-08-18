
-- 1. booking_requests: worker_id must match auth.uid() resolution
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workers can view own requests" ON public.booking_requests;
CREATE POLICY "Workers can view own requests"
ON public.booking_requests
FOR SELECT
TO authenticated
USING (
  worker_id IN (
    SELECT id FROM public.workers WHERE user_id = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Workers can update own requests" ON public.booking_requests;
CREATE POLICY "Workers can update own requests"
ON public.booking_requests
FOR UPDATE
TO authenticated
USING (
  worker_id IN (
    SELECT id FROM public.workers WHERE user_id = auth.uid()::text
  )
)
WITH CHECK (
  worker_id IN (
    SELECT id FROM public.workers WHERE user_id = auth.uid()::text
  )
);

-- 2. bookings: Workers can see pending bookings or those assigned to them
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workers can view available or assigned bookings" ON public.bookings;
CREATE POLICY "Workers can view available or assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  status = 'pending' 
  OR 
  worker_id IN (
    SELECT id FROM public.workers WHERE user_id = auth.uid()::text
  )
);

GRANT SELECT, UPDATE ON public.booking_requests TO authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.booking_requests TO service_role;
GRANT ALL ON public.bookings TO service_role;
