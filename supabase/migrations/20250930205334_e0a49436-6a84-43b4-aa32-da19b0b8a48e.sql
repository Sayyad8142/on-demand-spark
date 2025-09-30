-- Add is_busy field to workers table for job status tracking
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS is_busy boolean DEFAULT false;

-- Change community to communities array to support multiple locations
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS communities text[];

-- Migrate existing community data to communities array
UPDATE public.workers 
SET communities = ARRAY[community]::text[] 
WHERE community IS NOT NULL AND (communities IS NULL OR array_length(communities, 1) IS NULL);

-- Add payout_amount as alias/copy of price_inr for clarity
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payout_amount integer;
UPDATE public.bookings SET payout_amount = price_inr WHERE payout_amount IS NULL;

-- Create index for faster booking queries by worker
CREATE INDEX IF NOT EXISTS idx_bookings_worker_status ON public.bookings(worker_id, status) WHERE worker_id IS NOT NULL;

-- Create index for pending bookings by service and community
CREATE INDEX IF NOT EXISTS idx_bookings_pending_dispatch ON public.bookings(service_type, community, status) WHERE status = 'pending';

-- RPC: Accept a booking (worker accepts an instant booking)
CREATE OR REPLACE FUNCTION public.accept_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_worker record;
BEGIN
  -- Get current worker info
  SELECT * INTO v_worker FROM public.workers WHERE id = auth.uid();
  
  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker not found');
  END IF;

  IF NOT v_worker.is_available OR v_worker.is_busy THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker is not available');
  END IF;

  -- Lock the booking row
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking already assigned');
  END IF;

  -- Check if worker's service matches booking
  IF NOT (v_booking.service_type = ANY(v_worker.service_types)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service type mismatch');
  END IF;

  -- Assign worker to booking
  UPDATE public.bookings
  SET worker_id = auth.uid(),
      worker_name = v_worker.full_name,
      worker_phone = v_worker.phone,
      worker_photo_url = v_worker.photo_url,
      status = 'accepted',
      assigned_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;

  -- Mark worker as busy
  UPDATE public.workers
  SET is_busy = true,
      updated_at = now()
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'message', 'Booking accepted successfully'
  );
END;
$$;

-- RPC: Update booking status (worker updates job progress)
CREATE OR REPLACE FUNCTION public.update_booking_status(p_booking_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_valid_transition boolean := false;
BEGIN
  -- Get current booking
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  AND worker_id = auth.uid()
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found or not assigned to you');
  END IF;

  -- Validate status transitions
  IF v_booking.status = 'accepted' AND p_status = 'on_the_way' THEN
    v_valid_transition := true;
  ELSIF v_booking.status = 'on_the_way' AND p_status = 'started' THEN
    v_valid_transition := true;
  ELSIF v_booking.status = 'started' AND p_status = 'completed' THEN
    v_valid_transition := true;
  END IF;

  IF NOT v_valid_transition THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Invalid status transition from ' || v_booking.status || ' to ' || p_status
    );
  END IF;

  -- Update booking status
  UPDATE public.bookings
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_booking_id;

  -- If completed, mark worker as available again
  IF p_status = 'completed' THEN
    UPDATE public.workers
    SET is_busy = false,
        total_earnings = COALESCE(total_earnings, 0) + COALESCE(v_booking.price_inr, 0),
        last_active_at = now(),
        updated_at = now()
    WHERE id = auth.uid();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'new_status', p_status,
    'message', 'Status updated successfully'
  );
END;
$$;

-- Drop existing RLS policies if they exist to avoid conflicts
DROP POLICY IF EXISTS workers_read_own ON public.workers;
DROP POLICY IF EXISTS workers_update_own ON public.workers;
DROP POLICY IF EXISTS workers_see_matching_pending ON public.bookings;
DROP POLICY IF EXISTS workers_see_assigned ON public.bookings;

-- Enable RLS on workers table
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Workers can read their own record
CREATE POLICY workers_read_own ON public.workers
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Workers can update their own record
CREATE POLICY workers_update_own ON public.workers
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- RLS for bookings - workers can see pending bookings that match their service/community
CREATE POLICY workers_see_matching_pending ON public.bookings
FOR SELECT
TO authenticated
USING (
  status = 'pending' 
  AND EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = auth.uid()
    AND bookings.service_type = ANY(w.service_types)
    AND (bookings.community = ANY(w.communities) OR bookings.community = w.community)
  )
);

-- Workers can see their assigned bookings
CREATE POLICY workers_see_assigned ON public.bookings
FOR SELECT
TO authenticated
USING (worker_id = auth.uid());