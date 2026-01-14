-- Drop existing function and recreate with new return type and 30-minute lock enforcement
DROP FUNCTION IF EXISTS public.worker_set_booking_status(uuid, text);

-- Recreate with jsonb return type and 30-minute completion lock
CREATE OR REPLACE FUNCTION public.worker_set_booking_status(booking_id_param uuid, new_status_param text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_worker_id uuid;
  v_booking record;
  allowed boolean := false;
  v_lock_minutes int := 30;
  v_unlock_at timestamptz;
  v_remaining_seconds int;
begin
  v_worker_id := auth.uid();
  if v_worker_id is null then 
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select * into v_booking from bookings where id = booking_id_param and worker_id = v_worker_id;
  if not found then 
    return jsonb_build_object('success', false, 'error', 'Booking not found or not assigned to you');
  end if;

  -- Validate status transition
  if new_status_param = 'started' and v_booking.status in ('assigned', 'accepted', 'on_the_way') then 
    allowed := true; 
  end if;
  if new_status_param = 'on_the_way' and v_booking.status in ('assigned', 'accepted') then 
    allowed := true; 
  end if;
  if new_status_param = 'completed' and v_booking.status in ('assigned', 'accepted', 'on_the_way', 'started') then 
    allowed := true;
  end if;
  
  if not allowed then 
    return jsonb_build_object('success', false, 'error', 'Illegal transition from ' || v_booking.status || ' to ' || new_status_param);
  end if;

  -- Enforce 30-minute lock for completion
  if new_status_param = 'completed' then
    -- Calculate unlock time based on accepted_at, fallback to created_at if not set
    v_unlock_at := coalesce(v_booking.accepted_at, v_booking.created_at) + (v_lock_minutes || ' minutes')::interval;
    
    if now() < v_unlock_at then
      v_remaining_seconds := extract(epoch from (v_unlock_at - now()))::int;
      return jsonb_build_object(
        'success', false, 
        'error', 'Work can be completed only after 30 minutes',
        'error_code', 'COMPLETION_LOCKED',
        'remaining_seconds', v_remaining_seconds,
        'unlock_at', v_unlock_at
      );
    end if;
  end if;

  -- Perform the update
  update bookings
     set status = new_status_param,
         completed_at = case when new_status_param = 'completed' then now() else completed_at end,
         started_at = case when new_status_param = 'started' and started_at is null then now() else started_at end,
         on_the_way_at = case when new_status_param = 'on_the_way' and on_the_way_at is null then now() else on_the_way_at end,
         updated_at = now()
   where id = booking_id_param;

  insert into booking_status_history(booking_id, from_status, to_status, changed_by, note)
  values (booking_id_param, v_booking.status, new_status_param, v_worker_id, 'Updated by worker');

  return jsonb_build_object('success', true);
end $function$;