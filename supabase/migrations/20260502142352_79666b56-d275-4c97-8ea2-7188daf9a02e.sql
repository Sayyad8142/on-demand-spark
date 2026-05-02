-- Disable Cashfree beneficiary auto-sync trigger (moving payouts to Razorpay later)
DROP TRIGGER IF EXISTS trg_sync_cashfree_beneficiary ON public.workers;

-- Update payout-ready logic: UPI ID is the source of truth.
-- Worker is payout-ready if a valid UPI ID is present.
-- Bank details are optional and no longer required for payout_ready.
CREATE OR REPLACE FUNCTION public.set_worker_payout_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _bank_valid boolean;
  _has_upi boolean;
  _was_submitted boolean := false;
BEGIN
  IF NEW.ifsc_code IS NOT NULL THEN
    NEW.ifsc_code := UPPER(BTRIM(NEW.ifsc_code));
  END IF;

  IF TG_OP = 'INSERT' THEN
    _was_submitted := COALESCE(NULLIF(BTRIM(COALESCE(NEW.bank_account_number,'')), ''), NULL) IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    _was_submitted :=
      (OLD.account_holder_name IS DISTINCT FROM NEW.account_holder_name)
      OR (OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number)
      OR (OLD.ifsc_code IS DISTINCT FROM NEW.ifsc_code);
  END IF;

  _bank_valid := public.worker_has_valid_payout_details(
    NEW.account_holder_name,
    NEW.bank_account_number,
    NEW.ifsc_code
  );

  _has_upi := NEW.upi_id IS NOT NULL
    AND BTRIM(NEW.upi_id) <> ''
    AND POSITION('@' IN NEW.upi_id) > 1;

  IF NEW.bank_verification_status IN ('blocked','rejected') THEN
    NEW.payout_ready := false;
  ELSIF _has_upi OR _bank_valid THEN
    NEW.payout_ready := true;
    IF _bank_valid AND NEW.bank_verification_status <> 'auto_approved' THEN
      NEW.bank_verification_status := 'auto_approved';
      NEW.bank_verified_at := now();
    END IF;
  ELSE
    NEW.payout_ready := false;
    IF NEW.bank_verification_status = 'auto_approved' THEN
      NEW.bank_verification_status := 'pending';
    END IF;
  END IF;

  BEGIN
    IF _was_submitted THEN
      INSERT INTO public.worker_payout_audit_log(worker_id, action, details)
      VALUES (NEW.id, 'bank_details_submitted',
        jsonb_build_object(
          'op', TG_OP,
          'has_account_holder_name', NEW.account_holder_name IS NOT NULL,
          'account_number_len', char_length(COALESCE(NEW.bank_account_number,'')),
          'ifsc', NEW.ifsc_code,
          'valid', _bank_valid
        ));
    END IF;

    IF _bank_valid AND NEW.bank_verification_status = 'auto_approved'
       AND (TG_OP = 'INSERT' OR OLD.bank_verification_status IS DISTINCT FROM 'auto_approved') THEN
      INSERT INTO public.worker_payout_audit_log(worker_id, action, details)
      VALUES (NEW.id, 'auto_bank_approved',
        jsonb_build_object('verified_at', NEW.bank_verified_at));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'set_worker_payout_ready audit log failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Add UPI to the trigger column list so UPI changes recompute payout_ready
DROP TRIGGER IF EXISTS trg_set_worker_payout_ready ON public.workers;
CREATE TRIGGER trg_set_worker_payout_ready
  BEFORE INSERT OR UPDATE OF account_holder_name, bank_account_number, ifsc_code, upi_id, payout_ready
  ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_worker_payout_ready();

-- Backfill: workers with valid UPI but missing bank should now be payout_ready
UPDATE public.workers
SET upi_id = upi_id
WHERE upi_id IS NOT NULL
  AND BTRIM(upi_id) <> ''
  AND POSITION('@' IN upi_id) > 1
  AND payout_ready = false
  AND bank_verification_status NOT IN ('blocked','rejected');