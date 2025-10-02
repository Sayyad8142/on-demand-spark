-- Drop existing fcm_tokens table and recreate with simplified schema
drop table if exists public.fcm_tokens cascade;

-- Store each worker's web push token (simplified structure)
create table public.fcm_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.fcm_tokens enable row level security;

-- RLS policies for workers to manage their own tokens
create policy "fcm_upsert_self"
  on public.fcm_tokens for insert
  with check (user_id = auth.uid());

create policy "fcm_update_self"
  on public.fcm_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "fcm_select_self"
  on public.fcm_tokens for select
  using (user_id = auth.uid());

grant select, insert, update on public.fcm_tokens to authenticated;

-- Ensure pg_net extension for HTTP calls from triggers
create extension if not exists pg_net;

-- Function to call edge function after pending booking insert
create or replace function public.enqueue_booking_push()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'pending' then
    perform net.http_post(
      url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/booking-notifications',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('booking_id', new.id)
    );
  end if;
  return new;
end;
$$;

-- Trigger to enqueue push notifications
drop trigger if exists tr_booking_push on public.bookings;
create trigger tr_booking_push
  after insert on public.bookings
  for each row execute function public.enqueue_booking_push();