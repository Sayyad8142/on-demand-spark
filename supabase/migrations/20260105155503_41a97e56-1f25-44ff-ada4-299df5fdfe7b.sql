-- Add UPI QR Code columns to workers table
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS upi_qr_url TEXT,
ADD COLUMN IF NOT EXISTS upi_qr_payload TEXT,
ADD COLUMN IF NOT EXISTS upi_qr_uploaded_at TIMESTAMPTZ;

-- Create storage bucket for worker UPI QR codes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worker-upi-qr',
  'worker-upi-qr',
  true,
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for worker-upi-qr bucket
-- Policy: Workers can upload to their own folder
CREATE POLICY "Workers can upload their own QR"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker-upi-qr' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Workers can update their own QR
CREATE POLICY "Workers can update their own QR"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Workers can delete their own QR
CREATE POLICY "Workers can delete their own QR"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker-upi-qr' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Public can read QR images
CREATE POLICY "QR images are publicly accessible"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'worker-upi-qr');