-- Add payout detail columns to workers table
ALTER TABLE public.workers 
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS preferred_payout_method text DEFAULT 'upi';

-- Add payment_collected fields to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS worker_collected_payment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS worker_collection_method text,
  ADD COLUMN IF NOT EXISTS worker_collected_at timestamptz;