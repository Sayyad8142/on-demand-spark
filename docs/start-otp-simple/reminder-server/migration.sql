-- STAGED, NOT APPLIED. Start OTP reminder: admin flags + server-triggered reminder cancel.
-- Touches no OTP verification, dispatch, payment, availability or Complete OTP logic.
create extension if not exists pg_net;

create table if not exists public.booking_start_otp_flags (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  worker_id uuid,
  level text not null check (level in ('delayed','urgent_review')),
  delayed_at timestamptz not null default now(),
  urgent_at timestamptz,
  resolved_at timestamptz,
  resolution text check (resolution in ('otp_verified','cancelled','completed','reassigned','ended')),
  updated_at timestamptz not null default now()
);
grant select on public.booking_start_otp_flags to authenticated;
grant all on public.booking_start_otp_flags to service_role;
alter table public.booking_start_otp_flags enable row level security;
create policy "Admins read start otp flags" on public.booking_start_otp_flags
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create index if not exists booking_start_otp_flags_open on public.booking_start_otp_flags (level) where resolved_at is null;

-- Labels for the Admin Panel: 'delayed' = "Start OTP Delayed", 'urgent_review' = "Start OTP Urgent Review".

create or replace function public.refresh_start_otp_flags()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new int; v_urgent int; v_resolved int;
begin
  -- open/raise
  with elig as (
    select b.id, b.worker_id, coalesce(b.accepted_at, b.assigned_at) as acc
    from bookings b
    where b.start_otp_required = true and b.started_at is null
      and b.status in ('assigned','accepted','on_the_way') and b.worker_id is not null
      and coalesce(b.accepted_at, b.assigned_at) <= now() - interval '20 minutes'
  )
  insert into booking_start_otp_flags(booking_id, worker_id, level, delayed_at, urgent_at)
  select id, worker_id,
         case when acc <= now() - interval '2 hours' then 'urgent_review' else 'delayed' end,
         now(),
         case when acc <= now() - interval '2 hours' then now() end
  from elig
  on conflict (booking_id) do update
    set level = case when excluded.level = 'urgent_review' then 'urgent_review' else booking_start_otp_flags.level end,
        urgent_at = coalesce(booking_start_otp_flags.urgent_at, excluded.urgent_at),
        worker_id = excluded.worker_id,
        updated_at = now()
    where booking_start_otp_flags.resolved_at is null
      and (excluded.level = 'urgent_review' and booking_start_otp_flags.level <> 'urgent_review');
  get diagnostics v_new = row_count;

  -- resolve
  update booking_start_otp_flags f
     set resolved_at = now(), updated_at = now(),
         resolution = case
           when b.id is null then 'ended'
           when b.started_at is not null then 'otp_verified'
           when b.status in ('cancelled','canceled') then 'cancelled'
           when b.status = 'completed' then 'completed'
           when b.worker_id is distinct from f.worker_id then 'reassigned'
           else 'ended' end
    from (select f2.booking_id from booking_start_otp_flags f2 where f2.resolved_at is null) o
    left join bookings b on b.id = o.booking_id
   where f.booking_id = o.booking_id
     and (b.id is null or b.started_at is not null
          or b.status not in ('assigned','accepted','on_the_way')
          or b.worker_id is distinct from f.worker_id);
  get diagnostics v_resolved = row_count;
  return jsonb_build_object('upserted', v_new, 'resolved', v_resolved);
end $$;
revoke all on function public.refresh_start_otp_flags() from public, anon, authenticated;
grant execute on function public.refresh_start_otp_flags() to service_role;

-- Reminder cancel push. Fires only for Start OTP bookings, only to the worker who
-- held the booking (OLD.worker_id), only when reminders must stop.
create or replace function public.notify_start_otp_reminder_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-fcm';
  anon_key text := current_setting('app.start_otp_cancel_key', true);
  v_reason text;
begin
  if old.start_otp_required is not true or old.worker_id is null or old.started_at is not null then
    return new;
  end if;
  if old.status not in ('assigned','accepted','on_the_way') then return new; end if;
  v_reason := case
    when new.started_at is not null then 'otp_verified'
    when new.worker_id is distinct from old.worker_id then 'reassigned'
    when new.status not in ('assigned','accepted','on_the_way') then new.status
    else null end;
  if v_reason is null then return new; end if;

  begin
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce(anon_key,'')),
      body := jsonb_build_object(
        'workerIds', jsonb_build_array(old.worker_id::text),
        'title', '', 'body', '',
        'data', jsonb_build_object('type','START_OTP_REMINDER_CANCEL','booking_id', new.id::text,'reason', v_reason)));
  exception when others then
    null; -- never block the booking update
  end;

  update booking_start_otp_flags set resolved_at = now(), updated_at = now(),
         resolution = case v_reason when 'otp_verified' then 'otp_verified' when 'reassigned' then 'reassigned'
                       when 'completed' then 'completed' when 'cancelled' then 'cancelled' when 'canceled' then 'cancelled' else 'ended' end
   where booking_id = new.id and resolved_at is null;
  return new;
end $$;

drop trigger if exists trg_start_otp_reminder_cancel on public.bookings;
create trigger trg_start_otp_reminder_cancel
  after update of started_at, status, worker_id on public.bookings
  for each row execute function public.notify_start_otp_reminder_cancel();

-- Cron (apply with the migration): every minute.
-- select cron.schedule('start-otp-flags', '* * * * *', $$select public.refresh_start_otp_flags()$$);
