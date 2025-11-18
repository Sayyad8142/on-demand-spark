
-- Add token fields to rtc_calls table
ALTER TABLE public.rtc_calls 
ADD COLUMN IF NOT EXISTS caller_token TEXT,
ADD COLUMN IF NOT EXISTS callee_token TEXT;

-- Update status check constraint to include new statuses
ALTER TABLE public.rtc_calls DROP CONSTRAINT IF EXISTS rtc_calls_status_check;
ALTER TABLE public.rtc_calls ADD CONSTRAINT rtc_calls_status_check 
  CHECK (status IN ('initiated', 'ringing', 'active', 'completed', 'rejected', 'missed', 'cancelled', 'no_answer'));
