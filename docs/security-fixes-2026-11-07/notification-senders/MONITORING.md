# Notification rollout monitoring (read-only queries, safe to run any time)

## 1. Refused / would-be-refused requests (function logs)
Search each of send-fcm, send-webpush, booking-notifications, notify-next-tier, fcm-keepalive, worker-health-watchdog for:
- `notify_auth_observe_refuse` — Stage 1/2: who WOULD be blocked. Must reach 0 from real senders before Stage 3.
- `notify_auth_enforce_refuse` — Stage 3: who IS blocked. Any line from a real sender → roll back Stage 3.
- `"allow":true` grouped by `reason` — confirms each legitimate path (service_role, internal_key, verified_rejection, admin).

## 2. Missed booking alerts (DB) — compare to the 7 days before Stage 1
```sql
select date_trunc('hour', created_at) h,
  count(*) total,
  count(*) filter (where status in ('lost','not_delivered','unreachable')) missed,
  count(*) filter (where push_sent_at is not null) pushed,
  count(*) filter (where device_received_at is not null) received
from booking_requests where created_at > now() - interval '48 hours'
group by 1 order by 1 desc;
```
Stop signal: `pushed` drops to 0 for an hour with bookings coming in, or `received/pushed` falls > 20 points vs baseline.

## 3. Delivery acknowledgments (DB)
```sql
select event_type, count(*) from booking_offer_events
where created_at > now() - interval '24 hours' group by 1 order by 2 desc;
```
push_sent should keep pace with push_received / popup_shown as before.

## 4. Keep-alive experiment (DB)
```sql
select count(*) filter (where last_keepalive_sent_at > now()-interval '24 hours') sent_24h,
       count(*) filter (where last_keepalive_ack_at  > now()-interval '24 hours') acked_24h
from workers;
-- availability must not move because of keep-alive: compare with the watchdog OFF
select availability_last_source, count(*) from workers
where availability_last_changed_at > now()-interval '24 hours' group by 1;
```
`availability_last_source` must never show a keep-alive source.

## Keep-alive kill switches (independent of the security rollout)
- Fastest: `select cron.alter_job((select jobid from cron.job where jobname='fcm-keepalive-job'), active := false);`
- Or set secret `KEEPALIVE_ENABLED=false` (function returns `skipped: disabled`, sends nothing).
Decide after 2 weeks: keep only if ack rate is meaningful and missed alerts didn't rise.
