-- Drop ALL existing worker-photos policies to start clean
DROP POLICY IF EXISTS "Admins can upload worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload worker-photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update worker-photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete worker-photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read worker-photos" ON storage.objects;
DROP POLICY IF EXISTS "Worker photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Workers can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can upload their own worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers upload own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers update own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_insert_worker_photos" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_update_worker_photos" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_delete_worker_photos" ON storage.objects;

-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-photos', 'worker-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 1. Public read (bucket is public)
CREATE POLICY "wkr_photos_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'worker-photos');

-- 2. Workers can upload to their own folder
CREATE POLICY "wkr_photos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Workers can update their own photos
CREATE POLICY "wkr_photos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Workers can delete their own photos
CREATE POLICY "wkr_photos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Admins can do everything (uses SECURITY DEFINER is_admin())
CREATE POLICY "wkr_photos_admin"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'worker-photos' AND is_admin())
WITH CHECK (bucket_id = 'worker-photos' AND is_admin());