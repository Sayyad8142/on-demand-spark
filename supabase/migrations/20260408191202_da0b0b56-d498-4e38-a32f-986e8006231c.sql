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
$$ LANGUAGE plpgsql SET search_path = public;