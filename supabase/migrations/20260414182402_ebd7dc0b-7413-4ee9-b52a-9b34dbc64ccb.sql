
-- Add blocked-state columns to workers
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by uuid;

-- Index for quick filtering
CREATE INDEX IF NOT EXISTS idx_workers_is_blocked ON public.workers (is_blocked) WHERE is_blocked = true;

-- Trigger: when a worker is blocked, force is_available = false
CREATE OR REPLACE FUNCTION public.enforce_blocked_worker_offline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS DISTINCT FROM true) THEN
    NEW.is_available := false;
    NEW.blocked_at := COALESCE(NEW.blocked_at, now());
  END IF;
  -- When unblocked, clear blocked fields
  IF NEW.is_blocked = false AND OLD.is_blocked = true THEN
    NEW.blocked_at := NULL;
    NEW.blocked_reason := NULL;
    NEW.blocked_by := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_blocked_worker ON public.workers;
CREATE TRIGGER trg_enforce_blocked_worker
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_blocked_worker_offline();
