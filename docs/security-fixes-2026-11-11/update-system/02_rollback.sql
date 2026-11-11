ALTER TABLE public.app_bundles DROP CONSTRAINT IF EXISTS app_bundles_sha256_required;
ALTER TABLE public.app_bundles DROP CONSTRAINT IF EXISTS app_bundles_size_required;
ALTER TABLE public.app_bundles DROP CONSTRAINT IF EXISTS app_bundles_https_bucket;
