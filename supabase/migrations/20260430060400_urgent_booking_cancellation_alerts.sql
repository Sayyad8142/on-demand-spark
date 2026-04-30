create extension if not exists pg_net;

create or replace function public.notify_assigned_worker_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o';
  target_worker_id uuid;
begin
  target_worker_id := coalesce(old.worker_id, new.worker_id);

  if target_worker_id is null then
    return new;
  end if;

  if old.status is distinct from new.status
     and lower(coalesce(new.status, '')) in ('cancelled', 'canceled') then
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'workerIds', jsonb_build_array(target_worker_id::text),
        'title', 'BOOKING CANCELLED',
        'body', 'Your booking was cancelled. Do not go to the flat.',
        'data', jsonb_build_object(
          'type', 'BOOKING_CANCELLED',
          'bookingId', new.id::text,
          'booking_id', new.id::text,
          'booking_type', coalesce(new.booking_type, 'instant'),
          'title', 'BOOKING CANCELLED',
          'body', 'Your booking was cancelled. Do not go to the flat.'
        )
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_assigned_worker_booking_cancelled on public.bookings;
create trigger trg_notify_assigned_worker_booking_cancelled
  after update of status on public.bookings
  for each row
  execute function public.notify_assigned_worker_booking_cancelled();
