-- Drop the complex policies and create simple ones for debugging
DROP POLICY IF EXISTS "authenticated_users_upload_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_users_update_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_users_delete_own_folder" ON storage.objects;

-- Create simple policies that allow any authenticated user to upload
CREATE POLICY "allow_authenticated_insert_worker_photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'worker-photos');

CREATE POLICY "allow_authenticated_update_worker_photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'worker-photos');

CREATE POLICY "allow_authenticated_delete_worker_photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'worker-photos');