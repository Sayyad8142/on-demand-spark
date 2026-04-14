
-- Create table for tracking worker movement after booking acceptance
CREATE TABLE public.booking_worker_movement_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  monitoring_window_seconds integer NOT NULL DEFAULT 180,
  sensor_type_used text,
  sensor_supported boolean NOT NULL DEFAULT false,
  permission_granted boolean NOT NULL DEFAULT false,
  baseline_step_value bigint,
  final_step_value bigint,
  steps_in_window integer,
  min_required_steps integer NOT NULL DEFAULT 40,
  movement_status text NOT NULL DEFAULT 'pending',
  low_movement_flag boolean NOT NULL DEFAULT false,
  low_movement_reason text,
  checked_at timestamptz,
  raw_meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bwmc_booking_id ON public.booking_worker_movement_checks (booking_id);
CREATE INDEX idx_bwmc_worker_id ON public.booking_worker_movement_checks (worker_id);
CREATE INDEX idx_bwmc_low_movement ON public.booking_worker_movement_checks (low_movement_flag) WHERE low_movement_flag = true;

-- Enable RLS
ALTER TABLE public.booking_worker_movement_checks ENABLE ROW LEVEL SECURITY;

-- Workers can insert their own movement checks
CREATE POLICY "bwmc_worker_insert"
ON public.booking_worker_movement_checks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = booking_worker_movement_checks.worker_id
    AND w.user_id = (auth.uid())::text
  )
);

-- Workers can view their own movement checks
CREATE POLICY "bwmc_worker_select"
ON public.booking_worker_movement_checks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = booking_worker_movement_checks.worker_id
    AND w.user_id = (auth.uid())::text
  )
);

-- Workers can update their own movement checks
CREATE POLICY "bwmc_worker_update"
ON public.booking_worker_movement_checks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = booking_worker_movement_checks.worker_id
    AND w.user_id = (auth.uid())::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = booking_worker_movement_checks.worker_id
    AND w.user_id = (auth.uid())::text
  )
);

-- Admins can do everything
CREATE POLICY "bwmc_admin_all"
ON public.booking_worker_movement_checks
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
