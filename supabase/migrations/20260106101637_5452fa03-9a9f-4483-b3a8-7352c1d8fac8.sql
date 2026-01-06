-- Fix worker UPI QR uploads: simplify Storage RLS (remove auth.role() dependency)
-- and make workers self policies work with workers.id UUID + workers.user_id TEXT.

-- 1) Ensure bucket exists (keep public for easy preview)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worker-upi-qr',
  'worker-upi-qr',
  true,
  5242880,
  array['image/png','image/jpeg','image/jpg','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2) Storage policies for bucket worker-upi-qr
DROP POLICY IF EXISTS worker_upi_qr_insert_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_update_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_delete_own_folder ON storage.objects;
DROP POLICY IF EXISTS worker_upi_qr_read_own ON storage.objects;

CREATE POLICY worker_upi_qr_read_own
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY worker_upi_qr_insert_own_folder
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY worker_upi_qr_update_own_folder
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY worker_upi_qr_delete_own_folder
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Workers table self policies
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workers_select_own ON public.workers;
DROP POLICY IF EXISTS workers_insert_own ON public.workers;
DROP POLICY IF EXISTS workers_update_own ON public.workers;

CREATE POLICY workers_select_own
ON public.workers
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()::text
  OR id = auth.uid()
);

CREATE POLICY workers_insert_own
ON public.workers
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()::text
  OR id = auth.uid()
);

CREATE POLICY workers_update_own
ON public.workers
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()::text
  OR id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()::text
  OR id = auth.uid()
);
