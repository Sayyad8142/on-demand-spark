-- Drop existing worker upload policies and create a clearer one
DROP POLICY IF EXISTS "Workers can upload own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete own photos" ON storage.objects;

-- Create simple, explicit policies for workers
CREATE POLICY "authenticated_users_upload_own_folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "authenticated_users_update_own_folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "authenticated_users_delete_own_folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);