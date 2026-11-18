CREATE OR REPLACE FUNCTION public.guard_worker_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.approval_status := 'pending_approval';
      NEW.approval_reviewed_at := NULL;
      NEW.approval_reviewed_by := NULL;
      NEW.approval_rejection_reason := NULL;
      NEW.availability_requires_approval := true;
    ELSE
      NEW.approval_status := OLD.approval_status;
      NEW.approval_reviewed_at := OLD.approval_reviewed_at;
      NEW.approval_reviewed_by := OLD.approval_reviewed_by;
      NEW.approval_rejection_reason := OLD.approval_rejection_reason;
      NEW.availability_requires_approval := OLD.availability_requires_approval;
    END IF;
  END IF;

  IF NEW.is_available IS TRUE
     AND (NEW.approval_status = 'rejected'
          OR (NEW.availability_requires_approval AND NEW.approval_status <> 'approved')) THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_available := false;
    ELSIF OLD.is_available IS NOT TRUE THEN
      RAISE EXCEPTION 'WORKER_NOT_APPROVED: this worker must be approved by an admin before switching availability ON'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
