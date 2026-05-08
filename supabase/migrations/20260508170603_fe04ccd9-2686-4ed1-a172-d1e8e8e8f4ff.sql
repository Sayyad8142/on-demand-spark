
-- Passive movement tracking samples (separate from booking_worker_movement_checks)
CREATE TABLE IF NOT EXISTS public.worker_passive_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  step_count integer NOT NULL DEFAULT 0,
  previous_step_count integer NOT NULL DEFAULT 0,
  is_moving boolean NOT NULL DEFAULT false,
  sensor_type text,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_passive_movement_worker_recent
  ON public.worker_passive_movement (worker_id, sampled_at DESC);

ALTER TABLE public.worker_passive_movement ENABLE ROW LEVEL SECURITY;

-- Workers may read their own passive samples
DROP POLICY IF EXISTS "Workers read own passive movement" ON public.worker_passive_movement;
CREATE POLICY "Workers read own passive movement"
  ON public.worker_passive_movement
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = worker_passive_movement.worker_id
        AND (w.user_id = auth.uid()::text OR w.id = auth.uid())
    )
  );

-- Inserts/updates only via edge function with service role (no client policy on purpose)
