-- RPC for workers to see upcoming scheduled bookings (non-PII)
-- Returns only safe fields (no customer name/phone/address)

CREATE OR REPLACE FUNCTION public.get_worker_upcoming_scheduled_bookings(p_limit integer DEFAULT 10)
RETURNS TABLE (
  booking_id uuid,
  community text,
  service_type text,
  scheduled_date date,
  scheduled_time time,
  price_inr integer,
  payout_amount integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w record;
  comms text[];
BEGIN
  -- Find worker record for this authenticated user (supports legacy mapping)
  SELECT * INTO w
  FROM public.workers
  WHERE (public.workers.user_id = auth.uid()::text)
     OR (public.workers.id = auth.uid())
  LIMIT 1;

  IF w IS NULL THEN
    RETURN;
  END IF;

  comms := COALESCE(w.communities, ARRAY[w.community]);

  RETURN QUERY
  SELECT
    b.id AS booking_id,
    b.community,
    b.service_type,
    b.scheduled_date,
    b.scheduled_time,
    b.price_inr,
    b.payout_amount,
    b.status
  FROM public.bookings b
  WHERE b.booking_type = 'scheduled'
    AND b.is_demo = false
    AND b.scheduled_date >= current_date
    AND b.status = ANY(ARRAY['pending','assigned','confirmed','accepted'])
    AND b.community = ANY(comms)
    AND b.service_type = ANY(w.service_types)
    -- Don't leak other workers' assignments: show unassigned or assigned to this worker
    AND (b.worker_id IS NULL OR b.worker_id = w.id)
  ORDER BY b.scheduled_date ASC, b.scheduled_time ASC
  LIMIT p_limit;
END;
$$;

-- Allow authenticated users to call it
GRANT EXECUTE ON FUNCTION public.get_worker_upcoming_scheduled_bookings(integer) TO authenticated;
