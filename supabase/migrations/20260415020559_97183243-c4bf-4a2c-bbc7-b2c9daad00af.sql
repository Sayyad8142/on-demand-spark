-- Add token health tracking columns to workers table
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS fcm_token_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS fcm_token_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS fcm_token_platform text,
  ADD COLUMN IF NOT EXISTS fcm_last_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS fcm_last_fail_at timestamptz,
  ADD COLUMN IF NOT EXISTS fcm_last_fail_reason text;

-- Backfill: if a worker already has fcm_token, mark as active
UPDATE public.workers
SET fcm_token_status = 'active',
    fcm_token_updated_at = updated_at
WHERE fcm_token IS NOT NULL AND fcm_token != '';

-- Create index for dispatch queries filtering on token status
CREATE INDEX IF NOT EXISTS idx_workers_fcm_token_status ON public.workers (fcm_token_status);

COMMENT ON COLUMN public.workers.fcm_token_status IS 'Token health: active, invalid, missing';
COMMENT ON COLUMN public.workers.fcm_last_fail_reason IS 'Last FCM error code e.g. UNREGISTERED, SENDER_ID_MISMATCH';