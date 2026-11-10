-- Restores the 2026-11-10 live state. Keeps audit/request tables (history is never deleted).
begin;
drop trigger if exists trg_guard_worker_identity on public.workers;
drop function if exists public.guard_worker_identity();
drop function if exists public.admin_decide_worker_account_recovery(uuid, boolean, text);
drop index if exists public.workers_user_id_unique;

drop policy if exists workers_select_own on public.workers;
create policy workers_select_own on public.workers for select to authenticated
  using ((user_id = (auth.uid())::text) or (id = auth.uid())
    or (regexp_replace(phone, '\D', '', 'g') like ('%' || right(regexp_replace(coalesce((auth.jwt() ->> 'phone_number'), ''), '\D', '', 'g'), 10))));
drop policy if exists workers_update_own on public.workers;
create policy workers_update_own on public.workers for update to authenticated
  using ((user_id = (auth.uid())::text) or (id = auth.uid())) with check (user_id = (auth.uid())::text);
drop policy if exists workers_insert_own on public.workers;
create policy workers_insert_own on public.workers for insert to authenticated
  with check ((user_id = (auth.uid())::text) or (id = auth.uid()));

create or replace function public.ensure_worker_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_worker_id uuid; v_user_phone text; v_worker jsonb; v_auth_uid uuid;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
  select id into v_worker_id from public.workers where (user_id = v_auth_uid::text or id = v_auth_uid) limit 1;
  if v_worker_id is null then
    v_user_phone := auth.jwt() ->> 'phone_number';
    if v_user_phone is not null and v_user_phone <> '' then
      select id into v_worker_id from public.workers
        where regexp_replace(phone, '\D', '', 'g') like '%' || right(regexp_replace(v_user_phone, '\D', '', 'g'), 10) limit 1;
      if v_worker_id is not null then update public.workers set user_id = v_auth_uid::text where id = v_worker_id; end if;
    end if;
  end if;
  if v_worker_id is not null then
    select row_to_json(w)::jsonb into v_worker from public.workers w where id = v_worker_id;
    return v_worker;
  end if;
  return jsonb_build_object('success', false, 'error', 'Account not registered', 'code', 'WORKER_NOT_FOUND', 'auth_uid', v_auth_uid);
end $$;
commit;
