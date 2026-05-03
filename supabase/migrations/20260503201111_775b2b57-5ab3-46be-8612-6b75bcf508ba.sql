
-- Bookings
DROP POLICY IF EXISTS "Public read bookings" ON public.bookings;

-- Profiles (closes admin privilege escalation)
DROP POLICY IF EXISTS "Public read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public insert profiles" ON public.profiles;

-- Workers
DROP POLICY IF EXISTS "Allow public read access to workers" ON public.workers;

-- Settings
DROP POLICY IF EXISTS "Allow public write access to settings" ON public.settings;
CREATE POLICY "settings_admin_write"
  ON public.settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Communities (remove open mutation policies)
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.communities;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.communities;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.communities;

-- Dispatch runs - service role only for writes; admins read
DROP POLICY IF EXISTS "dispatch_runs_service_insert" ON public.dispatch_runs;
CREATE POLICY "dispatch_runs_service_all"
  ON public.dispatch_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "drw_service_insert" ON public.dispatch_run_workers;
CREATE POLICY "drw_service_all"
  ON public.dispatch_run_workers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Booking request delivery events - own worker + admin
DROP POLICY IF EXISTS "Authenticated users can read delivery events" ON public.booking_request_delivery_events;
CREATE POLICY "delivery_events_own_worker_or_admin_read"
  ON public.booking_request_delivery_events FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = booking_request_delivery_events.worker_id
        AND (w.id = auth.uid() OR w.user_id = (auth.uid())::text)
    )
  );

-- Worker heartbeats - own worker + admin
DROP POLICY IF EXISTS "Authenticated users can read heartbeats" ON public.worker_heartbeats;
CREATE POLICY "heartbeats_own_worker_or_admin_read"
  ON public.worker_heartbeats FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = worker_heartbeats.worker_id
        AND (w.id = auth.uid() OR w.user_id = (auth.uid())::text)
    )
  );
