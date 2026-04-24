-- Add reliability tracking columns to booking_requests
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS push_sent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS push_delivered_at   timestamptz,
  ADD COLUMN IF NOT EXISTS popup_shown_at      timestamptz,
  ADD COLUMN IF NOT EXISTS worker_seen_at      timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_sms_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_alert_channel  text,
  ADD COLUMN IF NOT EXISTS alert_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alert_last_error    text;

-- Index for the cron (find pending/sent requests past their timeout)
CREATE INDEX IF NOT EXISTS idx_booking_requests_status_timeout
  ON public.booking_requests (status, timeout_at)
  WHERE status IN ('pending', 'sent', 'queued');

-- Index for the worker-polling lookup (active requests for a given worker)
CREATE INDEX IF NOT EXISTS idx_booking_requests_worker_active
  ON public.booking_requests (worker_id, status, timeout_at DESC)
  WHERE status IN ('pending', 'sent', 'queued');

-- Index used by the dispatch retry to find candidate bookings
CREATE INDEX IF NOT EXISTS idx_booking_requests_booking_status
  ON public.booking_requests (booking_id, status);