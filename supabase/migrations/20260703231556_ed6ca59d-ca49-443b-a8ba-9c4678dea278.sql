
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS auto_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text,
  ADD COLUMN IF NOT EXISTS auto_paused_source text,
  ADD COLUMN IF NOT EXISTS auto_paused_restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_pause_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS workers_auto_paused_at_idx
  ON public.workers (auto_paused_at)
  WHERE auto_paused_at IS NOT NULL;
