-- Add policies for workers to manage their own photos

-- Policy: Workers can upload their own photos
CREATE POLICY "Workers can upload own photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Workers can update their own photos
CREATE POLICY "Workers can update own photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Workers can delete their own photos
CREATE POLICY "Workers can delete own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);