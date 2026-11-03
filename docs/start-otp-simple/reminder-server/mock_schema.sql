create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create extension if not exists pgcrypto;
create table public.bookings(id uuid primary key default gen_random_uuid(), worker_id uuid, status text, start_otp_required boolean, started_at timestamptz, accepted_at timestamptz, assigned_at timestamptz);
create table public.user_roles(user_id uuid, role text);
create function public.has_role(u uuid, r text) returns boolean language sql security definer as $$ select exists(select 1 from public.user_roles where user_id=u and role=r) $$;
create schema net; create table net.calls(id serial, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls(body) values (body) returning id::bigint $$;
