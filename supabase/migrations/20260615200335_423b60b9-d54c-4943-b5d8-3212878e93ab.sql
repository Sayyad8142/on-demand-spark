
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS notification_repair_failures INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.notify_admin_on_repair_failures()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.notification_repair_failures >= 3
     AND (OLD.notification_repair_failures IS NULL OR OLD.notification_repair_failures < 3) THEN
    INSERT INTO public.ops_alerts (
      entity_type, entity_id, alert_type, severity, title, message,
      recommended_action, status, metadata
    ) VALUES (
      'worker', NEW.id, 'notification_repair_failed', 'high',
      'Worker unable to restore notifications',
      'Worker ' || COALESCE(NEW.full_name, NEW.phone, NEW.id::text) ||
      ' is unable to restore notifications automatically.',
      'Contact worker to enable notifications in phone settings.',
      'open',
      jsonb_build_object(
        'failure_count', NEW.notification_repair_failures,
        'phone', NEW.phone,
        'community', NEW.community
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workers_notify_admin_repair_failures ON public.workers;
CREATE TRIGGER workers_notify_admin_repair_failures
AFTER UPDATE OF notification_repair_failures ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_on_repair_failures();
