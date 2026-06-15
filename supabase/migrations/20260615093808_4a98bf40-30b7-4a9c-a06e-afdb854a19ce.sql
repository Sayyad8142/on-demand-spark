
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS last_fcm_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS permissions_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS battery_hint_shown_at timestamptz;

COMMENT ON COLUMN public.workers.stale_device IS 'Analytics signal only. MUST NOT gate booking dispatch eligibility.';
COMMENT ON COLUMN public.workers.no_ack_count IS 'Analytics signal only. MUST NOT gate booking dispatch eligibility.';
COMMENT ON COLUMN public.workers.notification_health IS 'Analytics signal only. MUST NOT gate booking dispatch eligibility.';
COMMENT ON COLUMN public.workers.last_heartbeat_at IS 'Last seen ping. Used for admin analytics only — not for dispatch gating.';
