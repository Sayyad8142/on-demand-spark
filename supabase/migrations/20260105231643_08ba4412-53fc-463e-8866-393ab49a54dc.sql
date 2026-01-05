-- Fix worker-upi-qr storage RLS: some storage inserts use leading '/bucket/uid/..'
-- Allow uid in folder segments 1..3

DROP POLICY IF EXISTS worker_upi_qr_insert_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own_folder ON storage.objects;

CREATE POLICY worker_upi_qr_insert_own_folder
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);

CREATE POLICY worker_upi_qr_update_own_folder
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);

CREATE POLICY worker_upi_qr_delete_own_folder
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
    OR (storage.foldername(name))[3] = auth.uid()::text
  )
);
