-- 1. Ensure timestamp columns exist for booking status tracking
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_the_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Note: completed_at already exists

-- 2. Recreate concurrency-safe RPC for accepting bookings
CREATE OR REPLACE FUNCTION public.try_accept_booking(p_booking_id uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings;
BEGIN
  -- Lock the booking row to avoid races
  SELECT * INTO b
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF b.status <> 'pending' THEN
    RAISE EXCEPTION 'Already taken';
  END IF;

  -- Update booking status and set accepted_at timestamp
  UPDATE public.bookings
  SET worker_id   = auth.uid(),
      status      = 'accepted',
      accepted_at = now(),
      updated_at  = now()
  WHERE id = p_booking_id
  RETURNING * INTO b;

  -- Mark worker as busy
  UPDATE public.workers
  SET is_busy = true,
      updated_at = now()
  WHERE id = auth.uid();

  RETURN b;
END;
$$;

-- Back-compat with previous function name
CREATE OR REPLACE FUNCTION public.try_accept_pending(p_booking_id uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.try_accept_booking(p_booking_id);
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.try_accept_booking(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.try_accept_pending(uuid) TO authenticated, anon;