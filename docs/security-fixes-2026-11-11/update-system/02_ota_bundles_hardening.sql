-- STAGED — NOT APPLIED. OTA bundle rows must carry a fingerprint and size; only admins publish.
-- app_bundles currently has 0 rows, so these constraints cannot break existing data.
ALTER TABLE public.app_bundles
  ADD CONSTRAINT app_bundles_sha256_required CHECK (sha256 ~ '^[a-f0-9]{64}$') NOT VALID,
  ADD CONSTRAINT app_bundles_size_required CHECK (size_bytes BETWEEN 1 AND 31457280) NOT VALID,
  ADD CONSTRAINT app_bundles_https_bucket CHECK (bundle_url LIKE 'https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/%') NOT VALID;
ALTER TABLE public.app_bundles VALIDATE CONSTRAINT app_bundles_sha256_required;
ALTER TABLE public.app_bundles VALIDATE CONSTRAINT app_bundles_size_required;
ALTER TABLE public.app_bundles VALIDATE CONSTRAINT app_bundles_https_bucket;
-- Read stays authenticated-only (existing policy). Writes stay admin-only (existing is_admin policy).
-- Storage: ota-bundles bucket is public-read; ensure only admins can upload/overwrite:
--   CREATE POLICY "ota admins write" ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'ota-bundles' AND public.is_admin());
--   (same for UPDATE / DELETE). Review existing storage.objects policies first.
