-- Enable pg_net for HTTP requests
create extension if not exists pg_net;

-- Ensure fcm_tokens table exists with proper structure
create table if not exists public.fcm_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.fcm_tokens enable row level security;

-- RLS policies for fcm_tokens (idempotent)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fcm_tokens' and policyname='fcm_upsert_self') then
    create policy "fcm_upsert_self" on public.fcm_tokens for insert
      with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fcm_tokens' and policyname='fcm_update_self') then
    create policy "fcm_update_self" on public.fcm_tokens for update
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fcm_tokens' and policyname='fcm_select_self') then
    create policy "fcm_select_self" on public.fcm_tokens for select
      using (user_id = auth.uid());
  end if;
end $$;

-- Function to send FCM push via edge function for new bookings
create or replace function public.enqueue_booking_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm-v1';
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

-- Trigger on bookings insert
drop trigger if exists tr_booking_push_v1 on public.bookings;
create trigger tr_booking_push_v1
  after insert on public.bookings
  for each row execute function public.enqueue_booking_push_v1();

-- Function to notify assigned worker when manually assigned
create or replace function public.notify_on_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm-v1';
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

-- Trigger on bookings update for assignments
drop trigger if exists tr_notify_on_assignment_v1 on public.bookings;
create trigger tr_notify_on_assignment_v1
  after update on public.bookings
  for each row execute function public.notify_on_assignment_v1();