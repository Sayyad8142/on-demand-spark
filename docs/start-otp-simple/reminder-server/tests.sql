\set ON_ERROR_STOP 1
create temp table r(name text, ok boolean); grant all on r to authenticated;
-- fixtures
insert into bookings values
 ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','accepted',true,null,now()-interval '25 minutes',null), -- delayed
 ('00000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','accepted',true,null,now()-interval '130 minutes',null), -- urgent
 ('00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','accepted',true,null,now()-interval '5 minutes',null), -- too early
 ('00000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','accepted',false,null,now()-interval '60 minutes',null), -- no start otp
 ('00000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','assigned',true,null,null,now()-interval '30 minutes'); -- admin-assigned
select refresh_start_otp_flags();
insert into r select 'T1 delayed at 20m', (select level from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000001')='delayed';
insert into r select 'T2 urgent at 2h', (select level from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000002')='urgent_review';
insert into r select 'T3 none before 20m', not exists(select 1 from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000003');
insert into r select 'T4 none without Start OTP', not exists(select 1 from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000004');
insert into r select 'T5 assigned_at fallback', exists(select 1 from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000005');
select refresh_start_otp_flags();
insert into r select 'T6 refresh idempotent', (select count(*) from booking_start_otp_flags)=3;
-- escalation delayed -> urgent
update bookings set accepted_at=now()-interval '3 hours' where id='00000000-0000-0000-0000-000000000001';
select refresh_start_otp_flags();
insert into r select 'T7 escalates to urgent', (select level from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000001')='urgent_review';
-- verify -> cancel push + resolve
truncate net.calls;
update bookings set started_at=now(), status='started' where id='00000000-0000-0000-0000-000000000001';
insert into r select 'T8 verify sends 1 cancel push', (select count(*) from net.calls)=1;
insert into r select 'T9 push is booking+worker scoped', (select body->'data'->>'booking_id'='00000000-0000-0000-0000-000000000001' and body->'workerIds'->>0='11111111-1111-1111-1111-111111111111' and body->'data'->>'type'='START_OTP_REMINDER_CANCEL' from net.calls limit 1);
insert into r select 'T10 flag resolved otp_verified', (select resolution from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000001')='otp_verified';
-- later updates on started booking send nothing
truncate net.calls;
update bookings set status='completed' where id='00000000-0000-0000-0000-000000000001';
insert into r select 'T11 no repeat push after start', (select count(*) from net.calls)=0;
-- reassign -> push to OLD worker
update bookings set worker_id='22222222-2222-2222-2222-222222222222' where id='00000000-0000-0000-0000-000000000002';
insert into r select 'T12 reassign pushes old worker', (select body->'workerIds'->>0 from net.calls order by id desc limit 1)='11111111-1111-1111-1111-111111111111';
insert into r select 'T13 reassign resolves flag', (select resolution from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000002')='reassigned';
-- cancel
truncate net.calls;
update bookings set status='cancelled' where id='00000000-0000-0000-0000-000000000005';
insert into r select 'T14 cancel pushes + resolves', (select count(*) from net.calls)=1 and (select resolution from booking_start_otp_flags where booking_id='00000000-0000-0000-0000-000000000005')='cancelled';
-- unrelated update sends nothing
truncate net.calls;
update bookings set status='on_the_way' where id='00000000-0000-0000-0000-000000000003';
insert into r select 'T15 accepted->on_the_way no push', (select count(*) from net.calls)=0;
update bookings set status='cancelled' where id='00000000-0000-0000-0000-000000000004';
insert into r select 'T16 non-Start-OTP booking no push', (select count(*) from net.calls)=0;
-- push failure never blocks the booking update
create or replace function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as $$ begin raise exception 'down'; end $$;
update bookings set status='cancelled' where id='00000000-0000-0000-0000-000000000003';
insert into r select 'T17 push failure does not block', (select status from bookings where id='00000000-0000-0000-0000-000000000003')='cancelled';
-- never cancels / penalises: statuses untouched by flags
-- access
set test.uid='99999999-9999-9999-9999-999999999999';
set role authenticated;
insert into r select 'T19 non-admin sees no flags', (select count(*) from booking_start_otp_flags)=0;
reset role;
insert into user_roles values ('99999999-9999-9999-9999-999999999999','admin');
set role authenticated;
insert into r select 'T20 admin sees flags', (select count(*) from booking_start_otp_flags)>0;
reset role;
set role authenticated;
do $$ begin perform refresh_start_otp_flags(); insert into r values ('T21 workers cannot run refresh', false); exception when insufficient_privilege then insert into r values ('T21 workers cannot run refresh', true); end $$;
reset role;
select name, ok from r order by name;
select count(*) filter (where ok) as passed, count(*) as total from r;
