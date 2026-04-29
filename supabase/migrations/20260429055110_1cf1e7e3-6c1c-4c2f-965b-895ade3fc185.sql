ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS payout_ready BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.workers
SET payout_ready = (
  NULLIF(BTRIM(COALESCE(account_holder_name, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(bank_account_number, '')), '') IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(ifsc_code, '')), '') IS NOT NULL
);

CREATE OR REPLACE FUNCTION public.set_worker_payout_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.payout_ready := (
    NULLIF(BTRIM(COALESCE(NEW.account_holder_name, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(NEW.bank_account_number, '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(NEW.ifsc_code, '')), '') IS NOT NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_worker_payout_ready ON public.workers;

CREATE TRIGGER trg_set_worker_payout_ready
BEFORE INSERT OR UPDATE OF account_holder_name, bank_account_number, ifsc_code, payout_ready
ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.set_worker_payout_ready();

CREATE INDEX IF NOT EXISTS idx_workers_booking_eligibility
ON public.workers (selected_community_id, is_active, is_available, is_busy, payout_ready)
WHERE is_active = TRUE AND is_available = TRUE AND is_busy = FALSE AND payout_ready = TRUE;