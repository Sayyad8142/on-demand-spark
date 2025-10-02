-- Update the booking status transition trigger to allow accepted -> completed
CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow any transition if old status is null (INSERT)
  IF OLD IS NULL THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- From pending: can go to assigned, accepted (worker accepts), or cancelled
    IF OLD.status = 'pending' AND NEW.status NOT IN ('assigned', 'accepted', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
    END IF;
    
    -- From assigned: can go to accepted, cancelled, or back to pending (if worker unassigns)
    IF OLD.status = 'assigned' AND NEW.status NOT IN ('accepted', 'cancelled', 'pending') THEN
      RAISE EXCEPTION 'Invalid transition from assigned to %', NEW.status;
    END IF;
    
    -- From accepted: can go to on_the_way, completed, or cancelled
    IF OLD.status = 'accepted' AND NEW.status NOT IN ('on_the_way', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from accepted to %', NEW.status;
    END IF;
    
    -- From on_the_way: can go to started, completed, or cancelled
    IF OLD.status = 'on_the_way' AND NEW.status NOT IN ('started', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from on_the_way to %', NEW.status;
    END IF;
    
    -- From started: can go to completed or cancelled
    IF OLD.status = 'started' AND NEW.status NOT IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid transition from started to %', NEW.status;
    END IF;
    
    -- From completed: cannot change (final state)
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Cannot change status from completed';
    END IF;
    
    -- From cancelled: cannot change (final state) 
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot change status from cancelled';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;