# Lock down send-fcm and send-webpush — STAGED, NOT DEPLOYED

Status: waiting for owner approval. Saving files under `supabase/functions/` deploys them
straight to production, so nothing there was changed.

## Problem (repo copy; live version NOT VERIFIED)
- `send-fcm` only checks that an `Authorization` header exists; `send-webpush` checks nothing.
- Both run with `verify_jwt = false`. Anyone with the public anon key can push fake
  "New Booking" alerts to any worker.

## Callers that must keep working
| Caller | How it calls today (repo) | Needed change |
|---|---|---|
| fcm-keepalive | `Bearer SERVICE_ROLE_KEY` | none |
| worker-health-watchdog | `supabase.functions.invoke` with service-role client | none |
| notify-next-tier | `Bearer ANON_KEY` | switch to `Bearer SUPABASE_SERVICE_ROLE_KEY` |
| booking-notifications | check before phase 3 | use service role |
| DB triggers / cron (`net.http_post`) | NOT VERIFIED live | must send the service-role key |
| Worker App Verify Push page | user session | now sends `type: "TEST_PUSH"` (done in app) |
| Admin Panel test/broadcast tools | NOT VERIFIED | admin user session |

## Rule (`notify_auth.ts`, 8 offline tests pass)
Allow: service_role · admin user · a worker sending `TEST_PUSH` to only her own worker id.
Refuse: no token (401), anon key, other workers, a worker sending a booking alert (403).

## Safe rollout
1. Backup confirmed; note deployed versions of both functions.
2. **Phase 1 – observe:** deploy the guard with `NOTIFY_AUTH_MODE=observe`. It never blocks;
   it logs `notify_auth_observe_refuse:<reason>`. Watch logs for 24 h, list every caller refused.
3. **Phase 2 – fix callers:** switch notify-next-tier (and any caller from step 2) to the
   service-role key. Re-check that observe logs are empty for real dispatch traffic.
4. **Phase 3 – enforce:** set `NOTIFY_AUTH_MODE=enforce`.
5. Verify: a real booking still alerts the first-tier / favorite worker; reject → next tier
   still alerted; cancellation and Start OTP reminder pushes still arrive; a call with the
   anon key gets 403.
6. Rollback: set `NOTIFY_AUTH_MODE=observe` (instant, no redeploy of logic).

## Code to add at the top of each handler (after OPTIONS)
```ts
import { decideNotifyAccess, applyMode } from "../_shared/notify_auth.ts";
// verify token with supabase.auth.getClaims(token); role = claims.role, userId = claims.sub
// isAdmin via rpc("is_admin") with the caller's token; ownWorkerIds via
// workers where user_id = sub::text OR id = sub (service-role client)
const decision = decideNotifyAccess(caller, { workerIds, type: String(data?.type ?? body.type ?? "") });
const { block, log } = applyMode(decision, (Deno.env.get("NOTIFY_AUTH_MODE") ?? "observe") as "observe" | "enforce");
if (log) console.warn(log);
if (block) return new Response(JSON.stringify({ error: "Forbidden" }), { status: decision.allow ? 200 : decision.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
```
