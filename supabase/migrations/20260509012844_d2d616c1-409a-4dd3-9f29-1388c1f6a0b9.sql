DROP VIEW IF EXISTS public.worker_reliability_v;
CREATE VIEW public.worker_reliability_v
WITH (security_invoker = true) AS
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