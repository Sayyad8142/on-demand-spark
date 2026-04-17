
ALTER TABLE public.app_config 
  ADD COLUMN IF NOT EXISTS play_store_url_worker text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.didinow.partner',
  ADD COLUMN IF NOT EXISTS ios_store_url_worker text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_phone text NOT NULL DEFAULT '8008180018',
  ADD COLUMN IF NOT EXISTS latest_worker_version_name text NOT NULL DEFAULT '1.0.0';
