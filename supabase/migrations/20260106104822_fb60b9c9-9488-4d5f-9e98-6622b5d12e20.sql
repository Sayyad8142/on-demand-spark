-- Fix worker-upi-qr Storage RLS: allow uploads when object path is under the user's folder
-- Reason: Storage insert may not set `owner` before RLS WITH CHECK runs.

-- Drop existing worker-upi-qr policies
DROP POLICY IF EXISTS worker_upi_qr_public_read ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_select_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_insert_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own ON storage.objects;

-- Public read (bucket is public=true)
CREATE POLICY worker_upi_qr_public_read
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'worker-upi-qr');

-- Authenticated users can manage objects ONLY inside their own "{uid}/..." folder
CREATE POLICY worker_upi_qr_select_own
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY worker_upi_qr_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY worker_upi_qr_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY worker_upi_qr_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
