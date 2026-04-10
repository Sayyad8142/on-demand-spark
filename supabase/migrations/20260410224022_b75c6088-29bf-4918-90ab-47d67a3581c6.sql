CREATE POLICY "Workers can upload their own worker photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Workers can update their own worker photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Workers can delete their own worker photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);