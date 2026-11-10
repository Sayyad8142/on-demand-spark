#!/usr/bin/env bash
# Throwaway local Postgres rehearsal of migration.sql + rollback.sql. Never touches production.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
W=/tmp/linkage-pg; rm -rf "$W"; mkdir -p "$W"; chown 1000:1000 "$W"
RUN="setpriv --reuid=1000 --regid=1000 --clear-groups"
$RUN initdb -D "$W/data" -U postgres >/dev/null
$RUN pg_ctl -D "$W/data" -o "-p 55441 -k $W" -l "$W/log" start >/dev/null
trap '$RUN pg_ctl -D "$W/data" stop -m fast >/dev/null' EXIT
P="psql -h $W -p 55441 -U postgres -v ON_ERROR_STOP=1 -q -X"

A=aaaaaaaa-0000-0000-0000-00000000000a   # legit worker A
B=bbbbbbbb-0000-0000-0000-00000000000b   # new account reusing A's phone
C=cccccccc-0000-0000-0000-00000000000c   # other legit worker
D=dddddddd-0000-0000-0000-00000000000d   # duplicate/second account, other phone
ADM=eeeeeeee-0000-0000-0000-00000000000e

# Minimal fixture mirroring live workers policies/trigger (2026-11-10).
$P <<SQL
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users(id uuid primary key, phone text);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.sub', true),'')::uuid \$\$;
create function auth.jwt() returns jsonb language sql stable as \$\$ select jsonb_build_object('sub', current_setting('request.jwt.sub', true), 'phone', coalesce(current_setting('request.jwt.phone', true),'')) \$\$;
grant usage on schema public to anon, authenticated, service_role;
create table public.admins(uid uuid);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as \$\$ select exists(select 1 from public.admins where uid = auth.uid()) \$\$;
create table public.workers(id uuid primary key, user_id text, phone text unique not null, full_name text,
  fcm_token text, fcm_token_status text, is_available boolean default false);
create table public.bookings(id uuid primary key default gen_random_uuid(), worker_id uuid references public.workers(id), status text);
create table public.worker_payouts(id uuid primary key default gen_random_uuid(), worker_id uuid references public.workers(id) on delete restrict, amount int);
grant select, insert, update, delete on public.workers, public.bookings, public.worker_payouts to authenticated;
grant all on public.workers, public.bookings, public.worker_payouts to service_role;
alter table public.workers enable row level security;
create function public.set_worker_user_id_from_auth() returns trigger language plpgsql as \$\$ begin if new.user_id is null and auth.uid() is not null then new.user_id := auth.uid()::text; end if; return new; end \$\$;
create trigger set_worker_user_id_from_auth before insert or update on public.workers for each row execute function public.set_worker_user_id_from_auth();
create policy "Admins can manage workers" on public.workers for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into auth.users values ('$A','+919000000001'),('$B','+919000000001'),('$C','+919000000003'),('$D','+919000000004'),('$ADM',null);
insert into public.admins values ('$ADM');
insert into public.workers(id,user_id,phone,full_name,fcm_token) values ('$A','$A','+919000000001','A','tokA'),('$C','$C','+919000000003','C','tokC');
insert into public.bookings(worker_id,status) values ('$A','completed');
insert into public.worker_payouts(worker_id,amount) values ('$A',450);
SQL
# Apply rollback first to install the exact live policies + function, then the migration.
$P -f "$DIR/rollback.sql" >/dev/null
$P -f "$DIR/migration.sql" >/dev/null
$P -f "$DIR/migration.sql" >/dev/null   # idempotent

pass=0; fail=0
ok()  { echo "PASS $1"; pass=$((pass+1)); }
bad() { echo "FAIL $1"; fail=$((fail+1)); }
as() { # as <uid> <phone> <sql>  → prints result, empty on error
  $P -tA -c "begin; set local role authenticated; select set_config('request.jwt.sub','$1',true); select set_config('request.jwt.phone','$2',true); $3; commit;" 2>&1 | tail -n1; }
expect_ok()   { out=$(as "$2" "$3" "$4"); [[ "$out" != *ERROR* ]] && [[ "$out" == *"$5"* ]] && ok "$1" || bad "$1 → $out"; }
expect_err()  { out=$(as "$2" "$3" "$4"); [[ "$out" == *"$5"* ]] && ok "$1" || bad "$1 → $out"; }
sql() { $P -tA -c "$1"; }

# Legitimate sign-in and use
expect_ok  "01 legit worker A loads own profile"            $A +919000000001 "select ensure_worker_profile()->>'full_name'" "A"
expect_ok  "02 legit worker A edits own name"                $A +919000000001 "update workers set full_name='A2' where id='$A' returning full_name" "A2"
expect_ok  "03 legit no-op identity upsert still allowed"    $A +919000000001 "update workers set id='$A', user_id='$A', phone='+919000000001' where id='$A' returning id" "$A"
# Identity edits refused
expect_err "04 A cannot change workers.id"                   $A +919000000001 "update workers set id=gen_random_uuid() where id='$A'" "WORKER_IDENTITY_LOCKED: id"
expect_err "05 A cannot change phone"                        $A +919000000001 "update workers set phone='+919999999999' where id='$A'" "WORKER_IDENTITY_LOCKED: phone"
expect_err "06 A cannot hand user_id to another account"     $A +919000000001 "update workers set user_id='$B' where id='$A'" "user_id"
# Reused phone number (account B)
expect_ok  "07 reused phone gets ACCOUNT_RECOVERY_REQUIRED"  $B +919000000001 "select ensure_worker_profile()->>'code'" "ACCOUNT_RECOVERY_REQUIRED"
[[ $(sql "select user_id from workers where id='$A'") == "$A" ]] && ok "08 A's linkage unchanged after B signs in" || bad "08"
expect_ok  "09 B cannot read A's row (no phone-match read)"  $B +919000000001 "select count(*) from workers" "0"
expect_ok  "10 B update of A's row affects 0 rows"           $B +919000000001 "with u as (update workers set full_name='x' where phone='+919000000001' returning 1) select count(*) from u" "0"
expect_err "11 B cannot insert row claiming A's id"          $B +919000000001 "insert into workers(id,user_id,phone) values ('$A','$B','+919000000001')" "WORKER_IDENTITY_LOCKED"
expect_err "12 B cannot insert duplicate with A's phone"     $B +919000000001 "insert into workers(id,user_id,phone) values ('$B','$B','+919000000001')" "workers_phone_key"
expect_ok  "13 repeat sign-in keeps one pending request"     $B +919000000001 "select ensure_worker_profile()->>'code'" "ACCOUNT_RECOVERY_REQUIRED"
[[ $(sql "select count(*) from worker_account_recovery_requests where status='pending'") == 1 ]] && ok "14 exactly one pending request" || bad "14"
[[ $(sql "select count(*) from worker_account_link_events where event_type='blocked_phone_relink'") == 2 ]] && ok "15 each blocked relink audited" || bad "15"
expect_ok  "16 B sees only own request"                      $B +919000000001 "select count(*) from worker_account_recovery_requests" "1"
expect_ok  "17 C cannot see B's request"                     $C +919000000003 "select count(*) from worker_account_recovery_requests" "0"
# Cross-worker access
expect_ok  "18 C sees only own worker row"                   $C +919000000003 "select string_agg(full_name,',') from workers" "C"
expect_ok  "19 C cannot update A"                            $C +919000000003 "with u as (update workers set full_name='x' where id='$A' returning 1) select count(*) from u" "0"
# Duplicate / new accounts
expect_err "20 D cannot insert with a phone it didn't verify" $D +919000000004 "insert into workers(id,user_id,phone) values ('$D','$D','+919000000005')" "phone must match"
expect_ok  "21 D legit new signup with own phone works"      $D +919000000004 "insert into workers(id,user_id,phone,full_name) values ('$D','$D','+919000000004','D') returning full_name" "D"
expect_err "22 D cannot open second login on same row"      $D +919000000004 "insert into workers(id,user_id,phone) values (gen_random_uuid(),'$D','+919000000004')" "WORKER_IDENTITY_LOCKED"
# Recovery: authorization + audit
REQ=$(sql "select id from worker_account_recovery_requests where status='pending'")
expect_err "23 non-admin cannot approve recovery"            $B +919000000001 "select admin_decide_worker_account_recovery('$REQ', true, 'self approval attempt')" "FORBIDDEN"
expect_err "24 admin must give a reason"                     $ADM "" "select admin_decide_worker_account_recovery('$REQ', true, 'ok')" "NOTE_REQUIRED"
sql "insert into bookings(worker_id,status) values ('$A','pending')"
expect_err "25 recovery refused during an open booking"      $ADM "" "select admin_decide_worker_account_recovery('$REQ', true, 'Verified by call + ID card')" "ACTIVE_BOOKING"
sql "update bookings set status='completed' where status='pending'"
expect_ok  "26 admin approves recovery with reason"          $ADM "" "select admin_decide_worker_account_recovery('$REQ', true, 'Verified by call + ID card')->>'status'" "approved"
[[ $(sql "select user_id||'|'||id||'|'||coalesce(fcm_token,'none')||'|'||is_available from workers where phone='+919000000001'") == "$B|$A|none|false" ]] && ok "27 login moved, worker id kept, old push token cleared, OFF" || bad "27"
[[ $(sql "select count(*) from bookings where worker_id='$A'")$(sql "select sum(amount) from worker_payouts where worker_id='$A'") == "2450" ]] && ok "28 bookings + payout history preserved" || bad "28"
[[ $(sql "select count(*) from worker_account_link_events where event_type='recovery_approved' and actor_uid='$ADM' and previous_user_id='$A' and new_user_id='$B'") == 1 ]] && ok "29 approval audited with admin, old and new login" || bad "29"
expect_ok  "30 recovered account B now loads the worker"     $B +919000000001 "select ensure_worker_profile()->>'full_name'" "A2"
expect_ok  "31 old account A no longer sees the worker"      $A +919000000001 "select count(*) from workers" "0"
expect_err "32 request cannot be approved twice"             $ADM "" "select admin_decide_worker_account_recovery('$REQ', true, 'second time around')" "REQUEST_NOT_PENDING"
# Old account A now asks back → admin rejects
as $A +919000000001 "select ensure_worker_profile()" >/dev/null
REQ2=$(sql "select id from worker_account_recovery_requests where status='pending'")
expect_ok  "33 admin can reject a request"                   $ADM "" "select admin_decide_worker_account_recovery('$REQ2', false, 'Phone now belongs to B')->>'status'" "rejected"
[[ $(sql "select user_id from workers where id='$A'") == "$B" ]] && ok "34 rejection changes nothing" || bad "34"
# Phone mismatch / already-linked guards
sql "insert into worker_account_recovery_requests(worker_id, requesting_auth_uid) values ('$C','$D')"
REQ3=$(sql "select id from worker_account_recovery_requests where status='pending'")
expect_err "35 recovery refused when phones differ"          $ADM "" "select admin_decide_worker_account_recovery('$REQ3', true, 'Mistaken request here')" "PHONE_MISMATCH"
sql "update auth.users set phone='+919000000003' where id='$D'"
expect_err "36 recovery refused if login already has a worker" $ADM "" "select admin_decide_worker_account_recovery('$REQ3', true, 'Mistaken request here')" "ACCOUNT_ALREADY_LINKED"
# Server paths still work
sql "update workers set full_name='C-srv' where id='$C'" && ok "37 server/service role updates unaffected" || bad "37"
expect_ok  "38 admin app role can still edit non-identity fields" $ADM "" "update workers set full_name='C-adm' where id='$C' returning full_name" "C-adm"
expect_err "39 admin app role cannot edit phone directly"    $ADM "" "update workers set phone='+919111111111' where id='$C'" "WORKER_IDENTITY_LOCKED: phone"
# Legacy null user_id self-link
sql "insert into auth.users values ('ffffffff-0000-0000-0000-00000000000f','+919000000006'); insert into workers(id,user_id,phone,full_name) values ('ffffffff-0000-0000-0000-00000000000f',null,'+919000000006','F'); update workers set user_id=null where id='ffffffff-0000-0000-0000-00000000000f'"
expect_ok  "40 legacy null user_id: same login self-links" ffffffff-0000-0000-0000-00000000000f +919000000006 "select ensure_worker_profile()->>'user_id'" "ffffffff-0000-0000-0000-00000000000f"

# Rollback restores the old behaviour
$P -f "$DIR/rollback.sql" >/dev/null
expect_ok  "41 rollback restores old ensure_worker_profile"  $C +919000000003 "select ensure_worker_profile()->>'full_name'" "C-adm"
[[ $(sql "select count(*) from pg_trigger where tgname='trg_guard_worker_identity'") == 0 ]] && ok "42 rollback removes guard" || bad "42"
[[ $(sql "select count(*) from worker_account_link_events") -gt 0 ]] && ok "43 rollback keeps audit history" || bad "43"

echo "== $pass passed, $fail failed"
[[ $fail -eq 0 ]]
