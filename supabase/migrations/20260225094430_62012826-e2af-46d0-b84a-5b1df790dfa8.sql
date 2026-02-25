
-- Add integrity columns to app_bundles
ALTER TABLE public.app_bundles
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint;
