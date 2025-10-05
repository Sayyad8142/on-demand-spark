-- Update function to use OneSignal edge function
create or replace function public.enqueue_booking_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-onesignal';
  t text;
begin
  -- Only fire for 'pending' status at insert
  if new.status <> 'pending' then
    return new;
  end if;

  -- Loop through tokens of eligible workers
  for t in
    select ft.token
    from public.fcm_tokens ft
    join public.workers w on w.id = ft.user_id
    where
      w.is_active = true
      and w.is_available = true
      and (coalesce(w.service_types, '{}') @> array[new.service_type]::text[])
      and (
        coalesce(w.communities, '{}') = '{}'
        or coalesce(w.communities, '{}') @> array[new.community]::text[]
      )
  loop
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'token', t,
        'title', 'New Booking',
        'body', concat(new.service_type, ' • ', new.community, ' • Flat ', coalesce(new.flat_no,'')),
        'data', jsonb_build_object('booking_id', new.id::text)
      )
    );
  end loop;

  return new;
end;
$$;

-- Update assignment notification function
create or replace function public.notify_on_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-onesignal';
  t text;
begin
  if new.status = 'assigned' 
     and (old.worker_id is distinct from new.worker_id) 
     and new.worker_id is not null then
    for t in select token from public.fcm_tokens where user_id = new.worker_id loop
      perform net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body := jsonb_build_object(
          'token', t,
          'title', 'Job Assigned',
          'body', concat(new.service_type, ' • ', new.community, ' • Flat ', coalesce(new.flat_no,'')),
          'data', jsonb_build_object('booking_id', new.id::text)
        )
      );
    end loop;
  end if;
  return new;
end;
$$;