alter table public.workers
  add column if not exists last_verified_app_open_at timestamptz,
  add column if not exists last_reconnect_reminder_at timestamptz,
  add column if not exists reconnect_paused_by_worker boolean not null default false,
  add column if not exists reconnect_paused_by_admin boolean not null default false;

create or replace function public.guard_reconnect_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.reconnect_rpc', true), '') = '1'
     or current_user in ('postgres','service_role','supabase_admin') then
    return new;
  end if;
  if new.last_verified_app_open_at is distinct from old.last_verified_app_open_at
     or new.last_reconnect_reminder_at is distinct from old.last_reconnect_reminder_at
     or new.reconnect_paused_by_worker is distinct from old.reconnect_paused_by_worker
     or new.reconnect_paused_by_admin is distinct from old.reconnect_paused_by_admin then
    raise exception 'reconnect fields can only be changed via secure RPCs';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_reconnect_columns on public.workers;
create trigger trg_guard_reconnect_columns before update on public.workers
  for each row execute function public.guard_reconnect_columns();

create or replace function public.record_verified_app_open()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); end if;
  perform set_config('app.reconnect_rpc', '1', true);
  update public.workers set last_verified_app_open_at = now()
   where (user_id = v_uid::text or id = v_uid)
     and (last_verified_app_open_at is null or last_verified_app_open_at < now() - interval '10 minutes');
  get diagnostics v_n = row_count;
  perform set_config('app.reconnect_rpc', '', true);
  return jsonb_build_object('success', true, 'updated', v_n > 0);
end $$;
revoke all on function public.record_verified_app_open() from public, anon;
grant execute on function public.record_verified_app_open() to authenticated;

create or replace function public.set_reconnect_pause(_paused boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null or _paused is null then return jsonb_build_object('success', false, 'code', 'UNAUTHORIZED'); end if;
  perform set_config('app.reconnect_rpc', '1', true);
  update public.workers set reconnect_paused_by_worker = _paused
   where user_id = v_uid::text or id = v_uid;
  get diagnostics v_n = row_count;
  perform set_config('app.reconnect_rpc', '', true);
  return jsonb_build_object('success', v_n > 0, 'paused', _paused);
end $$;
revoke all on function public.set_reconnect_pause(boolean) from public, anon;
grant execute on function public.set_reconnect_pause(boolean) to authenticated;

create or replace function public.admin_set_reconnect_pause(_worker_id uuid, _paused boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.has_role(auth.uid(), 'admin') then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN'); end if;
  perform set_config('app.reconnect_rpc', '1', true);
  update public.workers set reconnect_paused_by_admin = coalesce(_paused, false) where id = _worker_id;
  get diagnostics v_n = row_count;
  perform set_config('app.reconnect_rpc', '', true);
  return jsonb_build_object('success', v_n > 0, 'paused', _paused);
end $$;
revoke all on function public.admin_set_reconnect_pause(uuid, boolean) from public, anon;
grant execute on function public.admin_set_reconnect_pause(uuid, boolean) to authenticated;

create table if not exists public.worker_reconnect_followups (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  reason text not null check (reason in ('missing_fcm_token','invalid_fcm_token','no_response')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
grant select, update on public.worker_reconnect_followups to authenticated;
grant all on public.worker_reconnect_followups to service_role;
alter table public.worker_reconnect_followups enable row level security;
create policy "Admins read reconnect followups" on public.worker_reconnect_followups
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins update reconnect followups" on public.worker_reconnect_followups
  for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create unique index if not exists worker_reconnect_followups_open_uq
  on public.worker_reconnect_followups (worker_id, reason) where resolved_at is null;