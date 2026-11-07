#!/usr/bin/env bash
# Throwaway local Postgres rehearsal of migration.sql + rollback.sql. Never touches production.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
W=/tmp/trig-pg; rm -rf "$W"; mkdir -p "$W"; chown 1000:1000 "$W"
RUN="setpriv --reuid=1000 --regid=1000 --clear-groups"
$RUN initdb -D "$W/data" -U postgres >/dev/null
$RUN pg_ctl -D "$W/data" -o "-p 55441 -k $W" -l "$W/log" start >/dev/null
trap '$RUN pg_ctl -D "$W/data" stop -m fast >/dev/null' EXIT
P="psql -h $W -p 55441 -U postgres -v ON_ERROR_STOP=1 -q -tA"
$P <<'SQL'
create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('dispatch_internal_key','k-test-123');
create schema net; create table net.calls(headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls values (headers, body); select 1::bigint $$;
create table public.bookings(id uuid primary key default gen_random_uuid(), status text, worker_id uuid, booking_type text, start_otp_required boolean, started_at timestamptz);
create table public.booking_start_otp_flags(booking_id uuid, resolved_at timestamptz, updated_at timestamptz, resolution text);
SQL
$P -f "$DIR/live-functions.fixture.sql"
$P <<'SQL'
create trigger t1 after update on bookings for each row execute function notify_assigned_worker_booking_cancelled();
create trigger t2 after update on bookings for each row execute function notify_start_otp_reminder_cancel();
SQL
check() { echo "$1: $($P -c "$2")"; }
fire() { $P -c "truncate net.calls; insert into bookings(id,status,worker_id,start_otp_required) values ('00000000-0000-0000-0000-00000000000$1','assigned',gen_random_uuid(),true); update bookings set status='cancelled' where id='00000000-0000-0000-0000-00000000000$1';"; }
fire 1; check "before: calls" "select count(*) from net.calls"; check "before: has key" "select count(*) from net.calls where headers ? 'x-internal-key'"
$P -f "$DIR/migration.sql"; $P -f "$DIR/migration.sql"  # idempotent
fire 2; check "after: calls" "select count(*) from net.calls"
check "after: key correct" "select count(*) from net.calls where headers->>'x-internal-key'='k-test-123' and headers->>'Authorization' like 'Bearer %'"
check "after: types" "select string_agg(body->'data'->>'type', ',' order by 1) from net.calls"
$P -c "delete from vault.decrypted_secrets"; fire 3; check "missing secret: still sends, empty key" "select count(*) from net.calls where headers->>'x-internal-key'=''"
$P -f "$DIR/rollback.sql"; fire 4; check "rollback: has key" "select count(*) from net.calls where headers ? 'x-internal-key'"; check "rollback: calls" "select count(*) from net.calls"
