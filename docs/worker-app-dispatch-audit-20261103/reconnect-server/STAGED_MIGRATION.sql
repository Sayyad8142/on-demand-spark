-- STAGED ONLY — NOT APPLIED. Step 2 needs owner GO.
-- Never changes is_available. Job not scheduled here.
alter table public.workers
  add column if not exists last_verified_app_open_at timestamptz,
  add column if not exists last_reconnect_reminder_at timestamptz,
  add column if not exists reconnect_paused_by_worker boolean not null default false,
  add column if not exists reconnect_paused_by_admin boolean not null default false;

create or replace function public.record_verified_app_open()
returns void language sql security definer set search_path = public as $$
  update public.workers set last_verified_app_open_at = now()
  where user_id = auth.uid()::text or id = auth.uid();
$$;
revoke all on function public.record_verified_app_open() from public, anon;
grant execute on function public.record_verified_app_open() to authenticated;

create or replace function public.set_reconnect_pause(_paused boolean)
returns void language sql security definer set search_path = public as $$
  update public.workers set reconnect_paused_by_worker = _paused
  where user_id = auth.uid()::text or id = auth.uid();
$$;
revoke all on function public.set_reconnect_pause(boolean) from public, anon;
grant execute on function public.set_reconnect_pause(boolean) to authenticated;

create table if not exists public.worker_reconnect_followups (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  reason text not null check (reason in ('missing_fcm_token','invalid_fcm_token','no_response')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
grant select on public.worker_reconnect_followups to authenticated;
grant all on public.worker_reconnect_followups to service_role;
alter table public.worker_reconnect_followups enable row level security;
create policy "Admins read reconnect followups" on public.worker_reconnect_followups
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- run_reconnect_reminders(dry_run boolean default true): mirrors src/lib/reconnectReminder.ts
-- (10:00–18:00 IST, 72h cap, rollout grace, slots next 7 days, worker/admin pause,
--  token issues → followups). Written in Step 2; cron added only in Step 4 (dry-run).
