CREATE TABLE IF NOT EXISTS public.token_repair_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('missing_recovered','invalid_recovered','rotated','ack_recovered','health_improved')),
  previous_status TEXT,
  new_status TEXT,
  source TEXT NOT NULL CHECK (source IN ('heartbeat','app_open','ack','manual_fix','boot_ping')),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.token_repair_events TO service_role;

ALTER TABLE public.token_repair_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON public.token_repair_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_token_repair_events_created_at
  ON public.token_repair_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_repair_events_worker
  ON public.token_repair_events (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_repair_events_type
  ON public.token_repair_events (event_type, created_at DESC);