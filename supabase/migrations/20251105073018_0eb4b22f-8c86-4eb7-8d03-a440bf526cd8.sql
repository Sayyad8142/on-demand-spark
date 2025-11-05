-- Create worker availability tables
CREATE TABLE IF NOT EXISTS public.worker_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slots BOOLEAN[] NOT NULL CHECK (array_length(slots, 1) = 26),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.worker_blackouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_id, date)
);

-- Add timezone and availability bypass to workers table
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata',
ADD COLUMN IF NOT EXISTS respect_availability BOOLEAN DEFAULT true;

-- RLS Policies for worker_availability
ALTER TABLE public.worker_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view own availability"
  ON public.worker_availability FOR SELECT
  USING (auth.uid() = worker_id OR auth.uid() IN (SELECT user_id FROM workers WHERE id = worker_id));

CREATE POLICY "Workers can insert own availability"
  ON public.worker_availability FOR INSERT
  WITH CHECK (auth.uid() = worker_id OR auth.uid() IN (SELECT user_id FROM workers WHERE id = worker_id));

CREATE POLICY "Workers can update own availability"
  ON public.worker_availability FOR UPDATE
  USING (auth.uid() = worker_id OR auth.uid() IN (SELECT user_id FROM workers WHERE id = worker_id));

CREATE POLICY "Admins can view all availability"
  ON public.worker_availability FOR SELECT
  USING (public.is_admin());

-- RLS Policies for worker_blackouts
ALTER TABLE public.worker_blackouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can manage own blackouts"
  ON public.worker_blackouts FOR ALL
  USING (auth.uid() = worker_id OR auth.uid() IN (SELECT user_id FROM workers WHERE id = worker_id));

CREATE POLICY "Admins can view all blackouts"
  ON public.worker_blackouts FOR SELECT
  USING (public.is_admin());

-- Function to check if worker is available at a given time
CREATE OR REPLACE FUNCTION is_worker_available_at_time(
  p_worker_id UUID,
  p_timestamp TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_worker RECORD;
  v_local_time TIMESTAMPTZ;
  v_local_date DATE;
  v_dow SMALLINT;
  v_minute_of_day INT;
  v_slot_index INT;
  v_slots BOOLEAN[];
BEGIN
  -- Get worker details
  SELECT timezone, respect_availability, is_available
  INTO v_worker
  FROM workers
  WHERE id = p_worker_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If worker is not available or respect_availability is off, use simple logic
  IF NOT v_worker.is_available THEN
    RETURN false;
  END IF;
  
  IF NOT v_worker.respect_availability THEN
    RETURN true;
  END IF;
  
  -- Convert to worker's local timezone
  v_local_time := p_timestamp AT TIME ZONE COALESCE(v_worker.timezone, 'Asia/Kolkata');
  v_local_date := v_local_time::DATE;
  
  -- Check blackout dates
  IF EXISTS (
    SELECT 1 FROM worker_blackouts
    WHERE worker_id = p_worker_id AND date = v_local_date
  ) THEN
    RETURN false;
  END IF;
  
  -- Calculate day of week (0=Sun, 6=Sat)
  v_dow := EXTRACT(DOW FROM v_local_time)::SMALLINT;
  
  -- Calculate minute of day
  v_minute_of_day := EXTRACT(HOUR FROM v_local_time)::INT * 60 + EXTRACT(MINUTE FROM v_local_time)::INT;
  
  -- Check if time is within 06:00-19:00 range
  IF v_minute_of_day < 360 OR v_minute_of_day >= 1140 THEN
    RETURN false;
  END IF;
  
  -- Calculate slot index (0-25)
  v_slot_index := FLOOR((v_minute_of_day - 360) / 30.0)::INT;
  
  -- Get slots for this day
  SELECT slots INTO v_slots
  FROM worker_availability
  WHERE worker_id = p_worker_id AND day_of_week = v_dow;
  
  IF NOT FOUND THEN
    -- No availability set, default to not available
    RETURN false;
  END IF;
  
  -- Check if slot is available (array is 1-indexed in PostgreSQL)
  RETURN v_slots[v_slot_index + 1];
END;
$$;

-- Function to seed default availability (all slots false)
CREATE OR REPLACE FUNCTION seed_worker_availability(p_worker_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_day INT;
BEGIN
  FOR v_day IN 0..6 LOOP
    INSERT INTO worker_availability (worker_id, day_of_week, slots)
    VALUES (p_worker_id, v_day, ARRAY_FILL(false, ARRAY[26]))
    ON CONFLICT (worker_id, day_of_week) DO NOTHING;
  END LOOP;
END;
$$;

-- Trigger to auto-seed availability for new workers
CREATE OR REPLACE FUNCTION trigger_seed_worker_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM seed_worker_availability(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_seed_worker_availability
  AFTER INSERT ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_worker_availability();

-- Update timestamp trigger for worker_availability
CREATE TRIGGER update_worker_availability_timestamp
  BEFORE UPDATE ON public.worker_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();