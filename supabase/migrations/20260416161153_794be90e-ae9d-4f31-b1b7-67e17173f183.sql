
-- 1. Change default service_types from empty array to ['maid']
ALTER TABLE public.workers ALTER COLUMN service_types SET DEFAULT ARRAY['maid']::text[];

-- 2. Create trigger function to auto-create availability slots for new workers
CREATE OR REPLACE FUNCTION public.auto_create_worker_availability_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day_idx integer;
  default_slots text[];
BEGIN
  -- Default slots: 07:00 to 18:30 in 30-min intervals (full day coverage)
  default_slots := ARRAY[
    '07:00:00','07:30:00','08:00:00','08:30:00',
    '09:00:00','09:30:00','10:00:00','10:30:00',
    '11:00:00','11:30:00','12:00:00','12:30:00',
    '13:00:00','13:30:00','14:00:00','14:30:00',
    '15:00:00','15:30:00','16:00:00','16:30:00',
    '17:00:00','17:30:00','18:00:00','18:30:00'
  ];

  -- Create slots for all 7 days (0=Monday through 6=Sunday)
  FOR day_idx IN 0..6 LOOP
    INSERT INTO public.worker_availability (worker_id, day_of_week, slots)
    VALUES (NEW.id, day_idx, default_slots)
    ON CONFLICT (worker_id, day_of_week) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Create trigger on workers table
DROP TRIGGER IF EXISTS trg_auto_create_worker_availability ON public.workers;
CREATE TRIGGER trg_auto_create_worker_availability
  AFTER INSERT ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_worker_availability_slots();
