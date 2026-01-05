-- Fix worker-upi-qr storage policies to allow optional leading slash in object name

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
  AND (
    name LIKE auth.uid()::text || '/%'
    OR name LIKE '/' || auth.uid()::text || '/%'
  )
);

CREATE POLICY "Workers can update their own QR"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE auth.uid()::text || '/%'
    OR name LIKE '/' || auth.uid()::text || '/%'
  )
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE auth.uid()::text || '/%'
    OR name LIKE '/' || auth.uid()::text || '/%'
  )
);

CREATE POLICY "Workers can delete their own QR"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'worker-upi-qr'
  AND auth.role() = 'authenticated'
  AND auth.uid() IS NOT NULL
  AND (
    name LIKE auth.uid()::text || '/%'
    OR name LIKE '/' || auth.uid()::text || '/%'
  )
);
