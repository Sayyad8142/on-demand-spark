-- Create RPC function for accepting pending bookings (concurrency safe)
CREATE OR REPLACE FUNCTION public.try_accept_pending(p_booking_id uuid)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings;
  w workers;
BEGIN
  -- Lock the booking row (skip if already locked)
  SELECT * INTO b
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or already being processed';
  END IF;

  IF b.status <> 'pending' THEN
    RAISE EXCEPTION 'Already taken';
  END IF;

  -- Validate worker is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get worker details
  SELECT * INTO w FROM workers WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker profile not found';
  END IF;

  -- Validate worker is eligible
  IF NOT w.is_available OR w.is_busy THEN
    RAISE EXCEPTION 'Not eligible';
  END IF;

  -- Validate service type and community match
  IF NOT (b.service_type = ANY(w.service_types)) THEN
    RAISE EXCEPTION 'Not eligible';
  END IF;

  IF NOT (b.community = ANY(w.communities) OR b.community = w.community) THEN
    RAISE EXCEPTION 'Not eligible';
  END IF;

  -- Accept the booking
  UPDATE bookings
  SET worker_id = auth.uid(),
      status = 'accepted',
      accepted_at = now(),
      worker_name = w.full_name,
      worker_phone = w.phone,
      worker_upi = w.upi_id,
      worker_photo_url = w.photo_url,
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO b;

  -- Mark worker as busy
  UPDATE workers
  SET is_busy = true,
      last_active_at = now(),
      updated_at = now()
  WHERE id = auth.uid();

  RETURN b;
END;
$$;

-- Add RLS policy for workers to see pending bookings that match their profile
CREATE POLICY "workers_can_see_matching_pending_bookings"
ON bookings
FOR SELECT
TO authenticated
USING (
  status = 'pending' 
  AND EXISTS (
    SELECT 1 FROM workers w
    WHERE w.id = auth.uid()
    AND w.is_active = true
    AND (
      bookings.service_type = ANY(w.service_types)
    )
    AND (
      bookings.community = ANY(w.communities)
      OR bookings.community = w.community
    )
  )
);