-- Fix RLS for workers profile updates: current policy checks user_id = auth.uid()::text
-- but user_id stores Firebase UID in some rows, so updates are silently blocked.

BEGIN;

DROP POLICY IF EXISTS worker_update_self ON public.workers;

CREATE POLICY worker_update_self
ON public.workers
FOR UPDATE
TO public
USING (
  id = auth.uid()
  OR user_id = auth.uid()::text
)
WITH CHECK (
  id = auth.uid()
  OR user_id = auth.uid()::text
);

COMMIT;