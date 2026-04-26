ALTER TABLE public.booking_worker_movement_checks
ADD COLUMN IF NOT EXISTS steps_counted integer GENERATED ALWAYS AS (steps_in_window) STORED,
ADD COLUMN IF NOT EXISTS sensor_available boolean GENERATED ALWAYS AS (sensor_supported) STORED,
ADD COLUMN IF NOT EXISTS error_message text GENERATED ALWAYS AS (
  CASE
    WHEN movement_status IN ('error', 'permission_denied', 'unsupported', 'check_failed') THEN low_movement_reason
    ELSE NULL
  END
) STORED;

CREATE INDEX IF NOT EXISTS idx_bwmc_steps_counted
ON public.booking_worker_movement_checks (steps_counted);

CREATE INDEX IF NOT EXISTS idx_bwmc_sensor_available
ON public.booking_worker_movement_checks (sensor_available);