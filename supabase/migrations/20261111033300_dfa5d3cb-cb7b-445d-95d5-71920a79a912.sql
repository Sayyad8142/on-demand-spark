ALTER TABLE public.app_bundles
  ADD CONSTRAINT app_bundles_sha256_required CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT app_bundles_size_required CHECK (size_bytes BETWEEN 1 AND 31457280),
  ADD CONSTRAINT app_bundles_https_bucket CHECK (bundle_url LIKE 'https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/%' AND bundle_url NOT LIKE '%..%');