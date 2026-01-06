-- Fix worker-upi-qr Storage RLS again: avoid storage.foldername() edge-cases by using prefix checks on name

DROP POLICY IF EXISTS worker_upi_qr_read_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_insert_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own_folder ON storage.objects;

-- Helper expression: allow a few possible prefixes that Storage may use
-- 1) {uid}/...
-- 2) /{uid}/...
-- 3) worker-upi-qr/{uid}/...
-- 4) /worker-upi-qr/{uid}/...

CREATE POLICY worker_upi_qr_read_own
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE (auth.uid()::text || '/%')
    OR name LIKE ('/' || auth.uid()::text || '/%')
    OR name LIKE ('worker-upi-qr/' || auth.uid()::text || '/%')
    OR name LIKE ('/worker-upi-qr/' || auth.uid()::text || '/%')
  )
);

CREATE POLICY worker_upi_qr_insert_own_folder
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE (auth.uid()::text || '/%')
    OR name LIKE ('/' || auth.uid()::text || '/%')
    OR name LIKE ('worker-upi-qr/' || auth.uid()::text || '/%')
    OR name LIKE ('/worker-upi-qr/' || auth.uid()::text || '/%')
  )
);

CREATE POLICY worker_upi_qr_update_own_folder
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE (auth.uid()::text || '/%')
    OR name LIKE ('/' || auth.uid()::text || '/%')
    OR name LIKE ('worker-upi-qr/' || auth.uid()::text || '/%')
    OR name LIKE ('/worker-upi-qr/' || auth.uid()::text || '/%')
  )
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE (auth.uid()::text || '/%')
    OR name LIKE ('/' || auth.uid()::text || '/%')
    OR name LIKE ('worker-upi-qr/' || auth.uid()::text || '/%')
    OR name LIKE ('/worker-upi-qr/' || auth.uid()::text || '/%')
  )
);

CREATE POLICY worker_upi_qr_delete_own_folder
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE (auth.uid()::text || '/%')
    OR name LIKE ('/' || auth.uid()::text || '/%')
    OR name LIKE ('worker-upi-qr/' || auth.uid()::text || '/%')
    OR name LIKE ('/worker-upi-qr/' || auth.uid()::text || '/%')
  )
);
