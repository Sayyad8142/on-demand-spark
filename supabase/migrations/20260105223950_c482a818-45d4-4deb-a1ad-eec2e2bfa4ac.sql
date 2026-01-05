-- Fix worker-upi-qr storage policies: allow both "uid/..." and "/uid/..." paths

DROP POLICY IF EXISTS "Workers can upload their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own QR" ON storage.objects;

CREATE POLICY "Workers can upload their own QR"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

CREATE POLICY "Workers can update their own QR"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

CREATE POLICY "Workers can delete their own QR"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);
