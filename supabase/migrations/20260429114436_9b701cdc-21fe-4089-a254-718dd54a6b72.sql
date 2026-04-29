ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS payout_ready BOOLEAN NOT NULL DEFAULT FALSE;

DROP TRIGGER IF EXISTS trg_auto_payout_ready ON public.workers;
DROP TRIGGER IF EXISTS trg_set_worker_payout_ready ON public.workers;
DROP FUNCTION IF EXISTS public.auto_set_payout_ready();

CREATE OR REPLACE FUNCTION public.worker_has_valid_payout_details(
  _account_holder_name text,
  _bank_account_number text,
  _ifsc_code text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    NULLIF(BTRIM(COALESCE(_account_holder_name, '')), '') IS NOT NULL
    AND BTRIM(COALESCE(_account_holder_name, '')) ~ '^[A-Za-z][A-Za-z .''-]{1,99}$'
    AND BTRIM(COALESCE(_bank_account_number, '')) ~ '^[0-9]{9,18}$'
    AND UPPER(BTRIM(COALESCE(_ifsc_code, ''))) ~ '^[A-Z]{4}0[A-Z0-9]{6}$';
$$;

CREATE OR REPLACE FUNCTION public.set_worker_payout_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ifsc_code IS NOT NULL THEN
    NEW.ifsc_code := UPPER(BTRIM(NEW.ifsc_code));
  END IF;

  NEW.payout_ready := public.worker_has_valid_payout_details(
    NEW.account_holder_name,
    NEW.bank_account_number,
    NEW.ifsc_code
  );

  RETURN NEW;
END;
$$;

UPDATE public.workers
SET payout_ready = public.worker_has_valid_payout_details(
  account_holder_name,
  bank_account_number,
  ifsc_code
);

CREATE TRIGGER trg_set_worker_payout_ready
BEFORE INSERT OR UPDATE OF account_holder_name, bank_account_number, ifsc_code, payout_ready
ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.set_worker_payout_ready();

CREATE INDEX IF NOT EXISTS idx_workers_booking_eligibility
ON public.workers (selected_community_id, is_active, is_available, is_busy, payout_ready)
WHERE is_active = TRUE AND is_available = TRUE AND is_busy = FALSE AND payout_ready = TRUE;