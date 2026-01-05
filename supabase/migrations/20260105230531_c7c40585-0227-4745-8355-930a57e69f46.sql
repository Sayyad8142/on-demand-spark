-- Fix: Storage INSERT policies were too restrictive due to role mismatch.
-- Use TO public + auth.role()='authenticated' so it works regardless of DB role mapping.

-- ============================
-- storage.objects policies (worker-upi-qr)
-- ============================
DROP POLICY IF EXISTS "Workers can upload their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own QR" ON storage.objects;

CREATE POLICY "Workers can upload their own QR"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Workers can update their own QR"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Workers can delete their own QR"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);


-- ============================
-- public.workers policies
-- (also use TO public but gated by auth.uid)
-- ============================
DROP POLICY IF EXISTS worker_select_self ON public.workers;
DROP POLICY IF EXISTS worker_insert_self ON public.workers;
DROP POLICY IF EXISTS worker_update_self ON public.workers;

CREATE POLICY worker_select_self
ON public.workers
FOR SELECT
TO public
USING (
  auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (user_id = auth.uid()::text OR id = auth.uid())
);

CREATE POLICY worker_insert_self
ON public.workers
FOR INSERT
TO public
WITH CHECK (
  auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND user_id = auth.uid()::text
);

CREATE POLICY worker_update_self
ON public.workers
FOR UPDATE
TO public
USING (
  auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (id = auth.uid() OR user_id = auth.uid()::text)
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (id = auth.uid() OR user_id = auth.uid()::text)
);
