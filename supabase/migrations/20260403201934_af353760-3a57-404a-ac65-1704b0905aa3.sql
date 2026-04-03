ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS razorpayx_contact_id text,
ADD COLUMN IF NOT EXISTS razorpayx_fund_account_id text;