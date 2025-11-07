-- Allow workers to view ratings given to them
CREATE POLICY "workers_view_own_ratings" ON worker_ratings
FOR SELECT
TO authenticated
USING (worker_id = auth.uid());