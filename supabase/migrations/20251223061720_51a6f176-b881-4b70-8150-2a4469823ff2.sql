-- Fix RLS so workers can read/update their own bookings even for legacy accounts
-- (some workers authenticate with auth.uid() == workers.id, others via workers.user_id)

DROP POLICY IF EXISTS "bookings_worker_select_assigned" ON public.bookings;
CREATE POLICY "bookings_worker_select_assigned"
ON public.bookings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = bookings.worker_id
      AND (
        w.id = auth.uid()
        OR w.user_id = auth.uid()::text
      )
  )
);

DROP POLICY IF EXISTS "bookings_worker_update_assigned" ON public.bookings;
CREATE POLICY "bookings_worker_update_assigned"
ON public.bookings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = bookings.worker_id
      AND (
        w.id = auth.uid()
        OR w.user_id = auth.uid()::text
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = bookings.worker_id
      AND (
        w.id = auth.uid()
        OR w.user_id = auth.uid()::text
      )
  )
);
