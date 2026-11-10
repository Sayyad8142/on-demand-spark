-- STAGED — NOT APPLIED. Worker account-linkage hardening (2026-11-10).
-- Requires Admin Panel sign-off (see HANDOFF.md). Idempotent. Rollback: rollback.sql.
begin;

-- 1. Audit trail of every blocked or approved identity change.
create table if not exists public.worker_account_link_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  event_type text not null check (event_type in
    ('blocked_phone_relink','recovery_requested','recovery_approved','recovery_rejected')),
  attempted_auth_uid uuid,
  previous_user_id text,
  new_user_id text,
  actor_uid uuid,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.worker_account_link_events to authenticated;
grant all on public.worker_account_link_events to service_role;
alter table public.worker_account_link_events enable row level security;
drop policy if exists wale_admin_read on public.worker_account_link_events;
create policy wale_admin_read on public.worker_account_link_events for select to authenticated using (public.is_admin());

-- 2. Recovery requests: created only by ensure_worker_profile, decided only by admin RPCs.
create table if not exists public.worker_account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete restrict,
  requesting_auth_uid uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists warr_one_pending
  on public.worker_account_recovery_requests (worker_id, requesting_auth_uid) where status = 'pending';
grant select on public.worker_account_recovery_requests to authenticated;
grant all on public.worker_account_recovery_requests to service_role;
alter table public.worker_account_recovery_requests enable row level security;
drop policy if exists warr_read on public.worker_account_recovery_requests;
create policy warr_read on public.worker_account_recovery_requests for select to authenticated
  using (requesting_auth_uid = auth.uid() or public.is_admin());

-- 3. Identity guard: app roles can never change id/phone/user_id or create a row for someone else.
--    SECURITY INVOKER on purpose: server functions (owner postgres) and service_role pass.
create or replace function public.guard_worker_identity()
returns trigger language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_phone text := right(regexp_replace(coalesce(auth.jwt()->>'phone', auth.jwt()->>'phone_number', ''), '\D', '', 'g'), 10);
begin
  if current_user not in ('anon','authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if v_uid is null or new.id is distinct from v_uid or coalesce(new.user_id, v_uid::text) <> v_uid::text then
      raise exception 'WORKER_IDENTITY_LOCKED: insert must be for the signed-in account' using errcode = '42501';
    end if;
    if v_jwt_phone = '' or right(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), 10) <> v_jwt_phone then
      raise exception 'WORKER_IDENTITY_LOCKED: phone must match the verified login' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id then
    raise exception 'WORKER_IDENTITY_LOCKED: id' using errcode = '42501';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'WORKER_IDENTITY_LOCKED: phone' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id
     and not (old.user_id is null and old.id = v_uid and new.user_id = v_uid::text) then
    raise exception 'WORKER_IDENTITY_LOCKED: user_id' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_worker_identity on public.workers;
-- Name sorts after set_worker_user_id_from_auth, so the filled-in user_id is checked.
create trigger trg_guard_worker_identity before insert or update on public.workers
  for each row execute function public.guard_worker_identity();

-- 4. Row access by linked login only (removes phone-match read and id fallback).
drop policy if exists workers_select_own on public.workers;
create policy workers_select_own on public.workers for select to authenticated
  using (user_id = auth.uid()::text);
drop policy if exists workers_update_own on public.workers;
create policy workers_update_own on public.workers for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists workers_insert_own on public.workers;
create policy workers_insert_own on public.workers for insert to authenticated
  with check (user_id = auth.uid()::text and id = auth.uid());

-- 5. One login per worker.
create unique index if not exists workers_user_id_unique on public.workers (user_id) where user_id is not null;

-- 6. ensure_worker_profile: never relinks by phone; opens a recovery request instead.
create or replace function public.ensure_worker_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_worker_id uuid;
  v_phone10 text;
  v_worker jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  select id into v_worker_id from public.workers where user_id = v_uid::text limit 1;
  if v_worker_id is not null then
    select row_to_json(w)::jsonb into v_worker from public.workers w where id = v_worker_id;
    return v_worker;
  end if;
  v_phone10 := right(regexp_replace(coalesce(auth.jwt()->>'phone', auth.jwt()->>'phone_number', ''), '\D', '', 'g'), 10);
  if v_phone10 <> '' then
    select id into v_worker_id from public.workers
      where right(regexp_replace(phone, '\D', '', 'g'), 10) = v_phone10 limit 1;
    if v_worker_id is not null then
      insert into public.worker_account_recovery_requests (worker_id, requesting_auth_uid)
        values (v_worker_id, v_uid) on conflict do nothing;
      insert into public.worker_account_link_events (worker_id, event_type, attempted_auth_uid)
        values (v_worker_id, 'blocked_phone_relink', v_uid);
      return jsonb_build_object('success', false, 'error', 'Account recovery required',
                                'code', 'ACCOUNT_RECOVERY_REQUIRED');
    end if;
  end if;
  return jsonb_build_object('success', false, 'error', 'Account not registered', 'code', 'WORKER_NOT_FOUND');
end $$;
revoke all on function public.ensure_worker_profile() from public, anon;
grant execute on function public.ensure_worker_profile() to authenticated;

-- 7. Admin-only, audited recovery decisions. Worker id (and all history) never changes.
create or replace function public.admin_decide_worker_account_recovery(p_request_id uuid, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; w record; v_req_phone text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_note is null or length(trim(p_note)) < 10 then raise exception 'NOTE_REQUIRED'; end if;
  select * into r from public.worker_account_recovery_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  select * into w from public.workers where id = r.worker_id for update;
  if not p_approve then
    update public.worker_account_recovery_requests set status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), review_note=p_note, updated_at=now() where id = r.id;
    insert into public.worker_account_link_events (worker_id, event_type, attempted_auth_uid, previous_user_id, actor_uid, note)
      values (w.id, 'recovery_rejected', r.requesting_auth_uid, w.user_id, auth.uid(), p_note);
    return jsonb_build_object('success', true, 'status', 'rejected');
  end if;
  select right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) into v_req_phone from auth.users where id = r.requesting_auth_uid;
  if v_req_phone is null or v_req_phone = '' or v_req_phone <> right(regexp_replace(w.phone, '\D', '', 'g'), 10) then
    raise exception 'PHONE_MISMATCH';
  end if;
  if exists (select 1 from public.workers where user_id = r.requesting_auth_uid::text) then
    raise exception 'ACCOUNT_ALREADY_LINKED';
  end if;
  if exists (select 1 from public.bookings b where b.worker_id = w.id and b.status in ('accepted','assigned','in_progress','started')) then
    raise exception 'ACTIVE_BOOKING';
  end if;
  update public.workers set user_id = r.requesting_auth_uid::text, fcm_token = null, fcm_token_status = 'missing', is_available = false where id = w.id;
  update public.worker_account_recovery_requests set status='approved', reviewed_by=auth.uid(), reviewed_at=now(), review_note=p_note, updated_at=now() where id = r.id;
  update public.worker_account_recovery_requests set status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), review_note='superseded', updated_at=now()
    where worker_id = w.id and status = 'pending';
  insert into public.worker_account_link_events (worker_id, event_type, attempted_auth_uid, previous_user_id, new_user_id, actor_uid, note)
    values (w.id, 'recovery_approved', r.requesting_auth_uid, w.user_id, r.requesting_auth_uid::text, auth.uid(), p_note);
  return jsonb_build_object('success', true, 'status', 'approved', 'worker_id', w.id);
end $$;
revoke all on function public.admin_decide_worker_account_recovery(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_worker_account_recovery(uuid, boolean, text) to authenticated;

commit;
