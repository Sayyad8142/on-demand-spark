-- Minimal stand-in for production objects the migration depends on.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true),'')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create type public.app_role as enum ('admin','worker','customer');
create table public.workers (id uuid primary key, user_id text, is_available boolean, is_busy boolean, is_blocked boolean, payout_ready boolean);
create table public.bookings (id uuid primary key, worker_id uuid, status text);
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null, role app_role not null);
create function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from user_roles where user_id=_user_id and role=_role) $$;
grant execute on function public.has_role(uuid, app_role) to authenticated;
insert into workers values ('11111111-1111-4111-8111-111111111111','uidOne',true,false,false,true),('22222222-2222-4222-8222-222222222222','uidTwo',false,true,false,false);
insert into bookings values (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','assigned');
insert into user_roles(user_id,role) values ('aaaaaaaa-0000-4000-8000-000000000001','admin'),('aaaaaaaa-0000-4000-8000-000000000002','worker');
