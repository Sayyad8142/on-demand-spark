-- STAGED — NOT APPLIED. Shared database (Worker App, User App, Admin Panel).
-- Apply only after: backup confirmed, User App + Admin Panel owners confirm the
-- notes below, and explicit owner approval. Start OTP config and training video
-- settings are intentionally readable by signed-in users and are NOT touched.

BEGIN;

-- 1. worker_ratings: anyone (even signed out) can read every rating + comment.
--    Worker App reads only its own ratings (workers_view_own_ratings stays).
--    User App: customer must still read/insert/update ratings for their own bookings.
DROP POLICY IF EXISTS worker_ratings_public_read ON public.worker_ratings;
CREATE POLICY worker_ratings_customer_read_own ON public.worker_ratings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b
                 WHERE b.id = worker_ratings.booking_id AND b.user_id = auth.uid()));
CREATE POLICY worker_ratings_admin_read ON public.worker_ratings
  FOR SELECT TO authenticated USING (public.is_admin());
-- NOTE: if the User App shows other customers' ratings publicly, expose only
-- averages through a SECURITY DEFINER function instead of reopening the table.

-- 2. flats: two duplicate "read everything" policies, readable signed out.
--    Worker App does not read flats. User App address picker: CONFIRM it runs
--    signed in; if it runs signed out, keep anon read but limit columns via a view.
DROP POLICY IF EXISTS "Public read flats" ON public.flats;
DROP POLICY IF EXISTS public_read_flats ON public.flats;
CREATE POLICY flats_signed_in_read ON public.flats
  FOR SELECT TO authenticated USING (true);

-- 3. worker_presence_snapshots: "service role insert" policy is actually open to everyone.
--    service_role bypasses RLS, so this policy is not needed for the server.
DROP POLICY IF EXISTS wps_service_role_insert ON public.worker_presence_snapshots;

-- 4. worker_emergency_pause: any signed-in user (incl. workers) can pause/unpause anyone.
DROP POLICY IF EXISTS "Authenticated insert pauses" ON public.worker_emergency_pause;
DROP POLICY IF EXISTS "Authenticated update pauses" ON public.worker_emergency_pause;
DROP POLICY IF EXISTS "Authenticated read pauses" ON public.worker_emergency_pause;
CREATE POLICY emergency_pause_admin_all ON public.worker_emergency_pause
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. worker_ops_case_events: any signed-in user can read and write ops case history.
DROP POLICY IF EXISTS "authenticated read events" ON public.worker_ops_case_events;
DROP POLICY IF EXISTS "authenticated write events" ON public.worker_ops_case_events;
CREATE POLICY ops_case_events_admin_read ON public.worker_ops_case_events
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY ops_case_events_admin_write ON public.worker_ops_case_events
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- 6. events_ingestion: readable by anyone signed out.
DROP POLICY IF EXISTS events_ingestion_public_read ON public.events_ingestion;
CREATE POLICY events_ingestion_admin_read ON public.events_ingestion
  FOR SELECT TO authenticated USING (public.is_admin());

COMMIT;
