-- Add columns for bank account details and passbook to workers
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS passbook_url TEXT,
  ADD COLUMN IF NOT EXISTS bank_details_source TEXT;

-- Create private storage bucket for passbook images
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-passbook', 'worker-passbook', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for worker-passbook bucket
-- Workers upload/read/update/delete their own passbook (folder = worker id or user id)
CREATE POLICY "Workers can view their own passbook"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'worker-passbook'
  AND (auth.uid()::text = (storage.foldername(name))[1])
);

CREATE POLICY "Workers can upload their own passbook"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'worker-passbook'
  AND (auth.uid()::text = (storage.foldername(name))[1])
);

CREATE POLICY "Workers can update their own passbook"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'worker-passbook'
  AND (auth.uid()::text = (storage.foldername(name))[1])
);

CREATE POLICY "Workers can delete their own passbook"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'worker-passbook'
  AND (auth.uid()::text = (storage.foldername(name))[1])
);
