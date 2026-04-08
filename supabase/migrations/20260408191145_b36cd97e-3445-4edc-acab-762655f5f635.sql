-- Fix existing workers with valid UPI but payout_ready = false
UPDATE public.workers
SET payout_ready = true
WHERE upi_id IS NOT NULL
  AND upi_id != ''
  AND upi_id LIKE '%@%'
  AND (payout_ready IS NULL OR payout_ready = false);

-- Safety: ensure workers without UPI have payout_ready = false
UPDATE public.workers
SET payout_ready = false
WHERE (upi_id IS NULL OR upi_id = '' OR upi_id NOT LIKE '%@%')
  AND (payout_ready IS NULL OR payout_ready = true);

-- Create a trigger to auto-set payout_ready whenever upi_id is updated
CREATE OR REPLACE FUNCTION public.auto_set_payout_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.upi_id IS NOT NULL AND NEW.upi_id != '' AND NEW.upi_id LIKE '%@%' THEN
    NEW.payout_ready := true;
  ELSE
    NEW.payout_ready := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_payout_ready ON public.workers;
CREATE TRIGGER trg_auto_payout_ready
  BEFORE INSERT OR UPDATE OF upi_id ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_payout_ready();