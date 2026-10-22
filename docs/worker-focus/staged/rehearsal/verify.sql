\set ON_ERROR_STOP 0
\echo === T1 existing rows unchanged
select md5(string_agg(w::text, ',' order by id)) = :'before_w' as workers_unchanged from workers w;
select md5(string_agg(b::text, ',' order by id)) = :'before_b' as bookings_unchanged from bookings b;
\echo === T2 service_role writes, newer-wins
set role service_role;
select upsert_worker_diagnostic_status('11111111-1111-4111-8111-111111111111','2026-10-22T11:30Z','{"network":"online","slot_state":"current_selected"}',false);
select upsert_worker_diagnostic_status('11111111-1111-4111-8111-111111111111','2026-10-22T10:00Z','{"network":"no_internet"}',false);
select upsert_worker_diagnostic_status('11111111-1111-4111-8111-111111111111','2026-10-22T11:30Z','{"network":"no_internet"}',false);
select network, slot_state, observed_at from worker_diagnostic_status;
select upsert_worker_diagnostic_status('11111111-1111-4111-8111-111111111111','2026-10-22T12:00Z','{}',true);
select network, session_state, last_logout_at is not null as logout_recorded from worker_diagnostic_status;
insert into worker_diagnostic_events(worker_id,event_id,kind,observed_at) values ('11111111-1111-4111-8111-111111111111','e1','snapshot',now());
insert into worker_diagnostic_events(worker_id,event_id,kind,observed_at) values ('11111111-1111-4111-8111-111111111111','e1','snapshot',now()) on conflict do nothing;
select count(*) as events_after_duplicate from worker_diagnostic_events;
reset role;
\echo === T3 anon blocked
set role anon;
select count(*) from worker_diagnostic_status;
select upsert_worker_diagnostic_status('11111111-1111-4111-8111-111111111111',now(),'{}',false);
reset role;
\echo === T4 signed-in non-admin: sees 0 rows, cannot write
set role authenticated; set request.jwt.uid='aaaaaaaa-0000-4000-8000-000000000002';
select count(*) as nonadmin_status_rows from worker_diagnostic_status;
select count(*) as nonadmin_event_rows from worker_diagnostic_events;
insert into worker_diagnostic_events(worker_id,event_id,kind,observed_at) values ('11111111-1111-4111-8111-111111111111','x','snapshot',now());
update worker_diagnostic_status set network='hacked';
select upsert_worker_diagnostic_status('11111111-1111-4111-8111-111111111111',now()+interval '1 day','{"network":"hacked"}',false);
\echo === T5 admin reads, cannot write
set request.jwt.uid='aaaaaaaa-0000-4000-8000-000000000001';
select count(*) as admin_status_rows from worker_diagnostic_status;
select count(*) as admin_event_rows from worker_diagnostic_events;
delete from worker_diagnostic_events;
reset role;
\echo === T6 still unchanged + no triggers added on existing tables
select md5(string_agg(w::text, ',' order by id)) = :'before_w' as workers_unchanged from workers w;
select count(*) as triggers_on_existing from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('workers','bookings') and not tgisinternal;
