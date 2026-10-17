# ack-booking-delivery — deployment and rollback (DRAFT, not executed)

Staged files (not live, because files outside `supabase/functions/` are never deployed):
- `docs/ack-recovery/staged/index.ts`: entry point with Deno.serve and the real clients.
- `docs/ack-recovery/staged/handler.ts`: current project logic plus the worker_id validation.
- `docs/ack-recovery/staged/handler.test.ts`: 24 offline tests. Not deployed.

## Preconditions (all required)
1. The owner confirms the backup of the live code AND its settings is saved: verify_jwt state, function name, and deploy date/version from the dashboard history.
2. The owner gives explicit written approval to deploy.
3. The offline tests pass: `cd docs/ack-recovery/staged && env -i PATH="$PATH" HOME=/root bun test` (24 pass).
4. Use a quiet window. Avoid 07:00–19:00 IST slot starts if possible, because scheduled dispatch runs every minute.

## Deploy (exact steps)
1. Copy `staged/index.ts` and `staged/handler.ts` into `supabase/functions/ack-booking-delivery/`. Do NOT copy the test file.
2. Keep `supabase/config.toml` unchanged: `[functions.ack-booking-delivery] verify_jwt = false`. Phones send the anon key, not a user JWT.
3. Deploy: Lovable `supabase--deploy_edge_functions ["ack-booking-delivery"]`, or from the CLI:
   `supabase functions deploy ack-booking-delivery --project-ref paywwbuqycovjopryele --no-verify-jwt`

## Verify (within 15 minutes)
1. Probe (writes nothing): POST `{"booking_id":"00000000-0000-0000-0000-000000000000","worker_id":"nonexistent-probe","event_type":"push_received"}` with the anon bearer. Expect **403 worker_unresolved**. A 400 "must be received or opened" means the old code is still live.
2. Probe with `worker_id":"x,id.neq.y"`: expect **400 bad worker_id**.
3. Real traffic:
   `select event_type, count(*) from booking_offer_events where source='device' and occurred_at > now()-interval '30 minutes' group by 1;`
   Expect push_received and popup_shown rows within 1–2 offer cycles.
4. `booking_requests.push_delivered_at` gets filled for new offers, and new `no_device_ack` unreachable rows stop for online workers.
5. Device spot-check (3 workers: foreground, background, killed). The phone's ACK log line should show `http=200`.

## Rollback triggers
Any of these: the probe returns 5xx; device ACKs are still 0 after 30 minutes while push_sent > 5; accept/reject or dispatch errors show up in the logs.

## Rollback (exact steps)
1. Replace `supabase/functions/ack-booking-delivery/index.ts` with the saved live backup and **delete `handler.ts`**. The backup is a single file.
2. Redeploy with the same verify_jwt setting that was recorded: `supabase functions deploy ack-booking-delivery --project-ref paywwbuqycovjopryele --no-verify-jwt`
3. Confirm the probe again returns 400 "must be received or opened", which is the old behaviour.
4. Fastest alternative: restore the previous version from the dashboard if it offers one, then record that in this file.

Note: rollback brings the outage back, so ACKs would be lost again. Rollback only protects against a worse failure.

## Monitoring (run every 15 min after deploy)
```sql
select count(*) filter (where source='server' and event_type='push_sent') as sent,
       count(*) filter (where source='device') as device_acks
from booking_offer_events where occurred_at > now() - interval '60 minutes';
-- ALERT when sent >= 5 and device_acks = 0
```
