
-- Create app_bundles table for OTA update management
CREATE TABLE public.app_bundles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id text NOT NULL DEFAULT 'worker',
  platform text NOT NULL DEFAULT 'android',
  channel text NOT NULL DEFAULT 'production',
  version text NOT NULL,
  bundle_url text NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT false,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_bundles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read bundles (workers need to check for updates)
CREATE POLICY "app_bundles_authenticated_read"
ON public.app_bundles
FOR SELECT
USING (true);

-- Only admins can manage bundles
CREATE POLICY "app_bundles_admin_all"
ON public.app_bundles
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Index for fast lookups
CREATE INDEX idx_app_bundles_lookup ON public.app_bundles (app_id, platform, channel, created_at DESC);

-- Create OTA bundles storage bucket (public read for download)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ota-bundles', 'ota-bundles', true);

-- Anyone can read/download bundles
CREATE POLICY "ota_bundles_public_read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'ota-bundles');

-- Only admins can upload bundles
CREATE POLICY "ota_bundles_admin_insert"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'ota-bundles' AND is_admin());

-- Only admins can delete bundles
CREATE POLICY "ota_bundles_admin_delete"
ON storage.objects
FOR DELETE
USING (bucket_id = 'ota-bundles' AND is_admin());
