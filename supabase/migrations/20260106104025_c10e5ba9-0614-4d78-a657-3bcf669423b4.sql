-- Fix worker-upi-qr Storage RLS: use `owner = auth.uid()` (robust) instead of path parsing

-- Drop existing worker-upi-qr policies (safe to run repeatedly)
DROP POLICY IF EXISTS worker_upi_qr_read_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_insert_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_select_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_insert_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_public_read ON storage.objects;

-- Optional: keep bucket public read (matches bucket's `public=true`)
CREATE POLICY worker_upi_qr_public_read
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'worker-upi-qr');

-- Authenticated users can manage ONLY rows they own in this bucket.
-- The Storage API sets `owner` from the JWT subject; users cannot spoof it.
CREATE POLICY worker_upi_qr_select_own
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND owner = auth.uid()
);

CREATE POLICY worker_upi_qr_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND owner = auth.uid()
);

CREATE POLICY worker_upi_qr_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND owner = auth.uid()
);

CREATE POLICY worker_upi_qr_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND owner = auth.uid()
);
