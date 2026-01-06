-- Fix worker-upi-qr Storage RLS: allow uploads even if the effective DB role is 'public'
-- (some Supabase Storage requests can evaluate policies under public),
-- while still requiring a logged-in user via auth.uid().

DROP POLICY IF EXISTS worker_upi_qr_read_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_insert_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own_folder ON storage.objects;

-- Read own files (optional)
CREATE POLICY worker_upi_qr_read_own
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);

-- Upload into own folder
CREATE POLICY worker_upi_qr_insert_own_folder
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);

-- Overwrite/update only in own folder
CREATE POLICY worker_upi_qr_update_own_folder
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);

-- Delete only in own folder
CREATE POLICY worker_upi_qr_delete_own_folder
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);
