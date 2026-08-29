CREATE OR REPLACE FUNCTION public.get_worker_upcoming_scheduled_bookings(p_limit integer DEFAULT 10)
RETURNS TABLE(
  booking_id uuid,
  community text,
  service_type text,
  scheduled_date date,
  scheduled_time time without time zone,
  price_inr integer,
  payout_amount integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.workers%ROWTYPE;
  comms text[];
  now_ist timestamp without time zone;
  today_ist date;
  current_time_ist time without time zone;
BEGIN
  now_ist := clock_timestamp() AT TIME ZONE 'Asia/Kolkata';
  today_ist := now_ist::date;
  current_time_ist := now_ist::time;

  SELECT * INTO w
  FROM public.workers
  WHERE public.workers.user_id = auth.uid()::text
     OR public.workers.id = auth.uid()
  LIMIT 1;

  IF w.id IS NULL THEN
    RETURN;
  END IF;

  comms := CASE
    WHEN cardinality(w.communities) > 0 THEN w.communities
    WHEN w.community IS NOT NULL THEN ARRAY[w.community]
    ELSE ARRAY[]::text[]
  END;

  RETURN QUERY
  SELECT
    b.id,
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
    AND b.status = ANY(ARRAY['pending', 'assigned', 'confirmed', 'accepted'])
    AND b.community = ANY(comms)
    AND b.service_type = ANY(COALESCE(w.service_types, ARRAY[]::text[]))
    AND (
      b.scheduled_date > today_ist
      OR (
        b.scheduled_date = today_ist
        AND (b.scheduled_time IS NULL OR b.scheduled_time > current_time_ist)
      )
    )
    AND (b.worker_id IS NULL OR b.worker_id = w.id)
  ORDER BY b.scheduled_date, b.scheduled_time
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
END;
$$;

REVOKE ALL ON FUNCTION public.get_worker_upcoming_scheduled_bookings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_worker_upcoming_scheduled_bookings(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_worker_upcoming_scheduled_bookings(integer) TO service_role;