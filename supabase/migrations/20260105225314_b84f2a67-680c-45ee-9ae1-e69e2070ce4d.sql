-- 1) Ensure workers table has required columns
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS upi_qr_url TEXT,
  ADD COLUMN IF NOT EXISTS upi_qr_payload TEXT,
  ADD COLUMN IF NOT EXISTS upi_qr_uploaded_at TIMESTAMPTZ;

-- 2) RLS: worker can SELECT/INSERT/UPDATE own worker row via user_id
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_select_self ON public.workers;
DROP POLICY IF EXISTS worker_insert_self ON public.workers;
DROP POLICY IF EXISTS worker_update_self ON public.workers;

CREATE POLICY worker_select_self
ON public.workers
FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text);

CREATE POLICY worker_insert_self
ON public.workers
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid()::text);

-- Allow updating legacy rows where id = auth.uid(), but enforce that user_id becomes auth.uid() going forward
CREATE POLICY worker_update_self
ON public.workers
FOR UPDATE
TO authenticated
USING ((id = auth.uid()) OR (user_id = auth.uid()::text))
WITH CHECK (user_id = auth.uid()::text);

-- Optional helper: auto-fill user_id when missing
CREATE OR REPLACE FUNCTION public.set_worker_user_id_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_worker_user_id_from_auth ON public.workers;
CREATE TRIGGER set_worker_user_id_from_auth
BEFORE INSERT OR UPDATE ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.set_worker_user_id_from_auth();


-- 3) Storage bucket + policies for worker-upi-qr
UPDATE storage.buckets
SET public = true
WHERE id = 'worker-upi-qr';

-- Drop old QR policies (idempotent)
DROP POLICY IF EXISTS "Workers can upload their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update their own QR" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete their own QR" ON storage.objects;
DROP POLICY IF EXISTS "QR images are publicly accessible" ON storage.objects;

-- Public read so QR can be shown in the user app
CREATE POLICY "QR images are publicly accessible"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'worker-upi-qr');

-- Upload rule: ONLY allow `${auth.uid()}/${...}`
CREATE POLICY "Workers can upload their own QR"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Workers can update their own QR"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND name LIKE auth.uid()::text || '/%'
)
WITH CHECK (
  bucket_id = 'worker-upi-qr'
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Workers can delete their own QR"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr'
  AND name LIKE auth.uid()::text || '/%'
);
