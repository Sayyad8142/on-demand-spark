-- Fix workers RLS: allow UPDATE for legacy rows where id = auth.uid() 
-- and permit setting user_id to auth.uid() during update

DROP POLICY IF EXISTS worker_update_self ON public.workers;

CREATE POLICY worker_update_self
ON public.workers
FOR UPDATE
TO authenticated
USING (
  (id = auth.uid()) 
  OR (user_id = auth.uid()::text)
)
WITH CHECK (
  -- Allow update if user_id is being set to auth.uid() OR already equals auth.uid()
  (user_id = auth.uid()::text)
  OR (id = auth.uid())
);

-- Also fix for legacy rows: update workers where id = auth.uid() but user_id is mismatched
UPDATE public.workers
SET user_id = id::text
WHERE id::text != COALESCE(user_id, '')
  AND id IN (SELECT id FROM auth.users);
