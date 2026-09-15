CREATE OR REPLACE FUNCTION public.booking_offer_open(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT b.status = 'pending' AND b.worker_id IS NULL
       FROM public.bookings b
      WHERE b.id = p_booking_id),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.booking_offer_open(uuid) TO anon, authenticated, service_role;

ALTER TABLE public.booking_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;