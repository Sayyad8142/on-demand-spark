
CREATE TABLE public.worker_missed_booking_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid,
  user_id text,
  booking_id uuid,
  booking_request_id uuid,
  reason text NOT NULL,
  app_state text,
  notification_permission text,
  overlay_granted boolean,
  battery_optimized boolean,
  fcm_token_status text,
  fcm_token_present boolean,
  is_online_toggle boolean,
  network_online boolean,
  last_heartbeat_at timestamptz,
  last_notification_at timestamptz,
  app_version text,
  platform text,
  manufacturer text,
  model text,
  sdk int,
  extra jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.worker_missed_booking_diagnostics TO authenticated;
GRANT ALL ON public.worker_missed_booking_diagnostics TO service_role;

ALTER TABLE public.worker_missed_booking_diagnostics ENABLE ROW LEVEL SECURITY;

-- Workers can only see their own diagnostics; inserts allowed for any authenticated user
-- (edge function uses service_role and validates worker_id server-side).
CREATE POLICY "workers_read_own_diagnostics"
  ON public.worker_missed_booking_diagnostics
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()::text)
    OR user_id = auth.uid()::text
  );

CREATE POLICY "authenticated_insert_own_diagnostics"
  ON public.worker_missed_booking_diagnostics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()::text)
    OR user_id = auth.uid()::text
  );

CREATE INDEX idx_missed_bookings_worker ON public.worker_missed_booking_diagnostics(worker_id, created_at DESC);
CREATE INDEX idx_missed_bookings_booking ON public.worker_missed_booking_diagnostics(booking_id);
