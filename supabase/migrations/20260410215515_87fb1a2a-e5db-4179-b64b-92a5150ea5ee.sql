
-- Ensure the worker-photos bucket exists and is public for reading
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-photos', 'worker-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Workers can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view worker photos" ON storage.objects;
DROP POLICY IF EXISTS "worker_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "worker_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "worker_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "worker_photos_delete" ON storage.objects;

-- Allow anyone to view worker photos (bucket is public)
CREATE POLICY "Anyone can view worker photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'worker-photos');

-- Allow authenticated users to upload photos in their own folder
CREATE POLICY "Workers can upload their own photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own photos
CREATE POLICY "Workers can update their own photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own photos
CREATE POLICY "Workers can delete their own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
