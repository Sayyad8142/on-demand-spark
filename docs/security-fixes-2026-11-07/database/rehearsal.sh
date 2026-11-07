#!/usr/bin/env bash
# Throwaway local Postgres rehearsal. Never touches production.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
W=/tmp/secfix-pg; rm -rf "$W"; mkdir -p "$W"; chown 1000:1000 "$W"
RUN="setpriv --reuid=1000 --regid=1000 --clear-groups"
$RUN initdb -D "$W/data" -U postgres >/dev/null
$RUN pg_ctl -D "$W/data" -o "-p 55439 -k $W" -l "$W/log" start >/dev/null
trap '$RUN pg_ctl -D "$W/data" stop -m fast >/dev/null' EXIT
P="psql -h $W -p 55439 -U postgres -v ON_ERROR_STOP=1 -q"
$P <<'SQL'
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create table public.admins(uid uuid);
create function public.is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.admins where uid = auth.uid()) $$;
create table public.bookings(id uuid primary key, user_id uuid, worker_id uuid);
create table public.worker_ratings(id serial, booking_id uuid, user_id uuid, worker_id uuid, rating int);
create table public.flats(id serial, flat_no text);
create table public.worker_presence_snapshots(id serial, worker_id uuid);
create table public.worker_emergency_pause(id serial, worker_id uuid);
create table public.worker_ops_case_events(id serial, note text);
create table public.events_ingestion(id serial, e text);
do $$ declare t text; begin foreach t in array array['bookings','worker_ratings','flats','worker_presence_snapshots','worker_emergency_pause','worker_ops_case_events','events_ingestion'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
end loop; end $$;
grant usage, select on all sequences in schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
create policy b_all on public.bookings for select using (true);
-- live policies as of 2026-11-07
create policy worker_ratings_public_read on public.worker_ratings for select using (true);
create policy "Public read flats" on public.flats for select using (true);
create policy public_read_flats on public.flats for select using (true);
create policy wps_service_role_insert on public.worker_presence_snapshots for insert with check (true);
create policy "Authenticated insert pauses" on public.worker_emergency_pause for insert to authenticated with check (true);
create policy "Authenticated read pauses" on public.worker_emergency_pause for select to authenticated using (true);
create policy "Authenticated update pauses" on public.worker_emergency_pause for update to authenticated using (true) with check (true);
create policy "authenticated read events" on public.worker_ops_case_events for select to authenticated using (true);
create policy "authenticated write events" on public.worker_ops_case_events for insert to authenticated with check (true);
create policy events_ingestion_public_read on public.events_ingestion for select to anon, authenticated using (true);
insert into public.admins values ('00000000-0000-0000-0000-00000000000a');
insert into public.bookings values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1',null);
insert into public.worker_ratings(booking_id,user_id,rating) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1',5);
insert into public.flats(flat_no) values ('101');
insert into public.events_ingestion(e) values ('x');
SQL
$P -f "$DIR/migration.sql"
check() { # role sub sql expect
  out=$($P -tA -c "set role $1; select set_config('request.jwt.sub','$2',false); $3" 2>&1 | tail -1 || true)
  if [[ "$out" == *"$4"* ]]; then echo "PASS  $5"; else echo "FAIL  $5 → got: $out"; exit 1; fi
}
C=00000000-0000-0000-0000-0000000000c1; X=00000000-0000-0000-0000-0000000000c9; A=00000000-0000-0000-0000-00000000000a
check anon "" "select count(*) from public.worker_ratings" "0" "signed-out cannot read ratings"
check authenticated $C "select count(*) from public.worker_ratings" "1" "customer reads rating on own booking"
check authenticated $X "select count(*) from public.worker_ratings" "0" "other user cannot read that rating"
check authenticated $A "select count(*) from public.worker_ratings" "1" "admin reads ratings"
check anon "" "select count(*) from public.flats" "0" "signed-out cannot read flats"
check authenticated $X "select count(*) from public.flats" "1" "signed-in user reads flats"
check anon "" "insert into public.worker_presence_snapshots(worker_id) values (null)" "row-level security" "anon cannot insert presence"
check service_role "" "insert into public.worker_presence_snapshots(worker_id) values (null) returning 1" "1" "server can still insert presence"
check authenticated $X "insert into public.worker_emergency_pause(worker_id) values (null)" "row-level security" "worker cannot pause anyone"
check authenticated $A "insert into public.worker_emergency_pause(worker_id) values (null) returning 1" "1" "admin can pause"
check authenticated $X "insert into public.worker_ops_case_events(note) values ('x')" "row-level security" "worker cannot write case events"
check authenticated $X "select count(*) from public.worker_ops_case_events" "0" "worker cannot read case events"
check authenticated $A "insert into public.worker_ops_case_events(note) values ('x') returning 1" "1" "admin writes case events"
check anon "" "select count(*) from public.events_ingestion" "0" "signed-out cannot read events"
$P -f "$DIR/rollback.sql"
check anon "" "select count(*) from public.worker_ratings" "1" "rollback restores old behaviour"
echo "ALL REHEARSAL CHECKS PASSED"
