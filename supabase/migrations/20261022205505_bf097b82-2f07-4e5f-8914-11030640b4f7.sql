create table public.worker_diagnostic_events (
  id bigserial primary key,
  worker_id uuid not null references public.workers(id) on delete cascade,
  event_id text not null,
  kind text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  data jsonb not null default '{}',
  unique (worker_id, event_id)
);
create table public.worker_diagnostic_status (
  worker_id uuid primary key references public.workers(id) on delete cascade,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  network text, notification_permission text, token_registered boolean,
  slot_state text, app_version text, session_state text,
  last_logout_at timestamptz
);
grant all on public.worker_diagnostic_events, public.worker_diagnostic_status to service_role;
grant usage, select on sequence public.worker_diagnostic_events_id_seq to service_role;
grant select on public.worker_diagnostic_events, public.worker_diagnostic_status to authenticated;
alter table public.worker_diagnostic_events enable row level security;
alter table public.worker_diagnostic_status enable row level security;
create policy "admins read diag events" on public.worker_diagnostic_events for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins read diag status" on public.worker_diagnostic_status for select to authenticated using (public.has_role(auth.uid(),'admin'));
create index on public.worker_diagnostic_events (worker_id, observed_at desc);

create or replace function public.upsert_worker_diagnostic_status(
  p_worker_id uuid, p_observed_at timestamptz, p_fields jsonb, p_logout boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into worker_diagnostic_status as s (worker_id, observed_at, network, notification_permission,
    token_registered, slot_state, app_version, session_state, last_logout_at)
  values (p_worker_id, p_observed_at, p_fields->>'network', p_fields->>'notification_permission',
    (p_fields->>'token_registered')::boolean, p_fields->>'slot_state', p_fields->>'app_version',
    case when p_logout then 'explicit_logout' else p_fields->>'session_state' end,
    case when p_logout then p_observed_at end)
  on conflict (worker_id) do update set
    observed_at = excluded.observed_at, received_at = now(),
    network = coalesce(excluded.network, s.network),
    notification_permission = coalesce(excluded.notification_permission, s.notification_permission),
    token_registered = coalesce(excluded.token_registered, s.token_registered),
    slot_state = coalesce(excluded.slot_state, s.slot_state),
    app_version = coalesce(excluded.app_version, s.app_version),
    session_state = coalesce(excluded.session_state, s.session_state),
    last_logout_at = coalesce(excluded.last_logout_at, s.last_logout_at)
  where excluded.observed_at > s.observed_at;
end $$;
revoke all on function public.upsert_worker_diagnostic_status(uuid, timestamptz, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.upsert_worker_diagnostic_status(uuid, timestamptz, jsonb, boolean) to service_role;