
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failure_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_app_version text,
  ADD COLUMN IF NOT EXISTS device_info jsonb;

CREATE INDEX IF NOT EXISTS idx_booking_requests_failure_reason
  ON public.booking_requests (failure_reason)
  WHERE failure_reason IS NOT NULL;
