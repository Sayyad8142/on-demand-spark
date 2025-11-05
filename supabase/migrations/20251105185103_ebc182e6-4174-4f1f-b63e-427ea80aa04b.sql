-- Drop and recreate authenticated worker photo policies with proper path security

-- Drop existing authenticated policies
DROP POLICY IF EXISTS "allow_authenticated_insert_worker_photos" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_update_worker_photos" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_delete_worker_photos" ON storage.objects;

-- Allow authenticated users to upload photos to their own folder only
CREATE POLICY "Workers upload own photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own photos only
CREATE POLICY "Workers update own photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'worker-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own photos only  
CREATE POLICY "Workers delete own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);