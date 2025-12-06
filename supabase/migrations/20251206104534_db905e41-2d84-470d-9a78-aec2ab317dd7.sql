-- Update the send_new_booking_push function to remove flat number from body
CREATE OR REPLACE FUNCTION public.send_new_booking_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  t text;
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm';
begin
  -- Only for instant bookings (no scheduled date)
  if new.scheduled_date is null then
    for t in (
      select token from public.fcm_tokens
      where user_id in (
        select user_id from public.workers
        where is_active and is_available
          and not is_busy
          and service_types @> array[new.service_type]
      )
    )
    loop
      perform net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body := jsonb_build_object(
          'token', t,
          'title', 'New Booking',
          'body', concat(new.service_type, ' • ', new.community),
          'data', jsonb_build_object('booking_id', new.id::text)
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

-- Update the send_job_assigned_push function to remove flat number from body
CREATE OR REPLACE FUNCTION public.send_job_assigned_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  t text;
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm';
begin
  if old.worker_id is null
     and new.worker_id is not null then
    for t in select token from public.fcm_tokens where user_id = new.worker_id loop
      perform net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body := jsonb_build_object(
          'token', t,
          'title', 'Job Assigned',
          'body', concat(new.service_type, ' • ', new.community),
          'data', jsonb_build_object('booking_id', new.id::text)
        )
      );
    end loop;
  end if;
  return new;
end;
$$;