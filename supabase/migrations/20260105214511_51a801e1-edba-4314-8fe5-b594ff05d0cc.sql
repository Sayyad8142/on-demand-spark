-- Drop existing storage policies for worker-upi-qr bucket
DROP POLICY IF EXISTS "Workers can upload their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own QR" ON storage.objects;
DROP POLICY IF EXISTS "QR images are publicly accessible" ON storage.objects;

-- Recreate with proper UUID casting
CREATE POLICY "Workers can upload their own QR"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'worker-upi-qr' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Workers can update their own QR"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'worker-upi-qr' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Workers can delete their own QR"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'worker-upi-qr' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "QR images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'worker-upi-qr');