-- Allow workers to update their own FCM token and availability
-- Drop existing policy if it exists and recreate with proper permissions
DROP POLICY IF EXISTS "workers_update_own_fcm_token" ON public.workers;

CREATE POLICY "workers_update_own_fcm_token"
ON public.workers
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());