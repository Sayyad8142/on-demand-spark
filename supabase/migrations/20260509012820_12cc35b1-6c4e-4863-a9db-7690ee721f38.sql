-- Phase 2: Reachability tracking columns + delivery events table

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS availability_state text NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN IF NOT EXISTS last_keepalive_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_keepalive_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notification_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fcm_token_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_permission text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS battery_optimized boolean,
  ADD COLUMN IF NOT EXISTS app_standby_bucket text,
  ADD COLUMN IF NOT EXISTS consecutive_delivery_failures int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS reliability_score numeric(5,2) NOT NULL DEFAULT 100.0;

CREATE INDEX IF NOT EXISTS idx_workers_availability_state ON public.workers(availability_state);
CREATE INDEX IF NOT EXISTS idx_workers_dispatch_cooldown ON public.workers(dispatch_cooldown_until);
CREATE INDEX IF NOT EXISTS idx_workers_last_keepalive_sent ON public.workers(last_keepalive_sent_at);

-- Delivery events
CREATE TABLE IF NOT EXISTS public.notification_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE,
  booking_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nde_worker_created ON public.notification_delivery_events(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nde_event_type ON public.notification_delivery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_nde_booking ON public.notification_delivery_events(booking_id);

ALTER TABLE public.notification_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view own delivery events"
  ON public.notification_delivery_events
  FOR SELECT
  USING (
    worker_id IN (
      SELECT id FROM public.workers
      WHERE user_id = (auth.uid())::text OR id = auth.uid()
    )
  );

-- Helper: derive availability_state for a worker.
CREATE OR REPLACE FUNCTION public.compute_worker_availability_state(_worker_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w RECORD;
BEGIN
  SELECT
    is_available, fcm_token, notification_permission, battery_optimized,
    last_keepalive_ack_at, last_notification_received_at, last_active_at,
    last_fcm_token_refresh_at, dispatch_cooldown_until, fcm_token_status
  INTO w
  FROM public.workers
  WHERE id = _worker_id;

  IF NOT FOUND OR w.is_available IS NOT TRUE THEN RETURN 'OFFLINE'; END IF;
  IF w.fcm_token IS NULL OR w.fcm_token_status = 'invalid' THEN RETURN 'TOKEN_STALE'; END IF;
  IF w.notification_permission = 'denied' THEN RETURN 'NOTIFICATION_BLOCKED'; END IF;
  IF w.last_fcm_token_refresh_at IS NOT NULL
     AND w.last_fcm_token_refresh_at < now() - interval '7 days' THEN RETURN 'TOKEN_STALE'; END IF;
  IF w.battery_optimized IS TRUE
     AND (w.last_keepalive_ack_at IS NULL OR w.last_keepalive_ack_at < now() - interval '90 minutes')
     THEN RETURN 'BATTERY_RESTRICTED'; END IF;
  IF (w.last_keepalive_ack_at IS NULL OR w.last_keepalive_ack_at < now() - interval '45 minutes')
     AND (w.last_active_at IS NULL OR w.last_active_at < now() - interval '10 minutes')
     THEN RETURN 'ONLINE_DEGRADED'; END IF;
  RETURN 'ONLINE_HEALTHY';
END;
$$;

-- Reachability view for admin dashboard
CREATE OR REPLACE VIEW public.worker_reliability_v AS
SELECT
  w.id, w.user_id, w.full_name, w.phone,
  w.is_available, w.availability_state,
  w.last_active_at, w.last_seen_at,
  w.last_keepalive_sent_at, w.last_keepalive_ack_at,
  w.last_notification_received_at,
  w.fcm_token_updated_at, w.last_fcm_token_refresh_at,
  w.fcm_token_status, w.fcm_token_platform,
  w.last_boot_at, w.last_boot_oem, w.last_boot_android_version,
  w.notification_permission, w.battery_optimized, w.app_standby_bucket,
  w.consecutive_delivery_failures, w.dispatch_cooldown_until,
  w.reliability_score
FROM public.workers w;

-- Recompute trigger when key fields change
CREATE OR REPLACE FUNCTION public.recompute_availability_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.availability_state := public.compute_worker_availability_state(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workers_recompute_state ON public.workers;
CREATE TRIGGER trg_workers_recompute_state
BEFORE UPDATE OF is_available, fcm_token, fcm_token_status, notification_permission,
                 battery_optimized, last_keepalive_ack_at, last_notification_received_at,
                 last_active_at, last_fcm_token_refresh_at, dispatch_cooldown_until
ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.recompute_availability_state();