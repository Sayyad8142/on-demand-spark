
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS last_boot_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_boot_oem text,
  ADD COLUMN IF NOT EXISTS last_boot_android_version text;

CREATE INDEX IF NOT EXISTS idx_workers_last_notification_received_at
  ON public.workers (last_notification_received_at);
CREATE INDEX IF NOT EXISTS idx_workers_last_boot_at
  ON public.workers (last_boot_at);
