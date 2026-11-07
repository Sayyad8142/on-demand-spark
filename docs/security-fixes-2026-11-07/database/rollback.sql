-- Restores the exact policies live on 2026-11-07 (read from pg_policies).
BEGIN;
DROP POLICY IF EXISTS worker_ratings_customer_read_own ON public.worker_ratings;
DROP POLICY IF EXISTS worker_ratings_admin_read ON public.worker_ratings;
CREATE POLICY worker_ratings_public_read ON public.worker_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS flats_signed_in_read ON public.flats;
CREATE POLICY "Public read flats" ON public.flats FOR SELECT USING (true);
CREATE POLICY public_read_flats ON public.flats FOR SELECT USING (true);

CREATE POLICY wps_service_role_insert ON public.worker_presence_snapshots FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS emergency_pause_admin_all ON public.worker_emergency_pause;
CREATE POLICY "Authenticated insert pauses" ON public.worker_emergency_pause FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated read pauses" ON public.worker_emergency_pause FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated update pauses" ON public.worker_emergency_pause FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ops_case_events_admin_read ON public.worker_ops_case_events;
DROP POLICY IF EXISTS ops_case_events_admin_write ON public.worker_ops_case_events;
CREATE POLICY "authenticated read events" ON public.worker_ops_case_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write events" ON public.worker_ops_case_events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS events_ingestion_admin_read ON public.events_ingestion;
CREATE POLICY events_ingestion_public_read ON public.events_ingestion FOR SELECT TO anon, authenticated USING (true);
COMMIT;
