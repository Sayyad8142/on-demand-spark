-- Drop and recreate the send_new_booking_push function to look at workers.fcm_token directly
CREATE OR REPLACE FUNCTION public.send_new_booking_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text;
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm';
  worker_ids uuid[];
  eligible_worker record;
BEGIN
  -- Only for instant bookings (no scheduled date)
  IF new.scheduled_date IS NULL THEN
    -- Get eligible workers directly from workers table (has fcm_token there)
    FOR eligible_worker IN (
      SELECT id, fcm_token, user_id
      FROM public.workers
      WHERE is_active = true 
        AND is_available = true
        AND NOT is_busy
        AND service_types @> array[new.service_type]
        AND fcm_token IS NOT NULL
        AND fcm_token <> ''
    )
    LOOP
      -- Send notification using the worker's fcm_token
      PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true)
        ),
        body := jsonb_build_object(
          'workerIds', jsonb_build_array(eligible_worker.id),
          'title', 'New Booking!',
          'body', concat(new.service_type, ' • ', new.community, ' • ₹', new.price_inr),
          'data', jsonb_build_object(
            'type', 'BOOKING_ALERT',
            'booking_id', new.id::text,
            'service_type', new.service_type,
            'community', new.community,
            'cust_name', new.cust_name,
            'flat_no', new.flat_no,
            'price_inr', new.price_inr
          )
        )
      );
    END LOOP;
  END IF;
  RETURN new;
END;
$function$;