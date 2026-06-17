ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS overlay_permission_granted boolean,
  ADD COLUMN IF NOT EXISTS overlay_permission_updated_at timestamptz;

COMMENT ON COLUMN public.workers.overlay_permission_granted IS
  'True when the worker app last reported SYSTEM_ALERT_WINDOW (overlay) permission granted. Dispatch eligibility excludes workers where this is explicitly false.';
COMMENT ON COLUMN public.workers.notification_permission_granted IS
  'True when the worker app last reported notifications permission granted. Dispatch eligibility excludes workers where this is explicitly false.';