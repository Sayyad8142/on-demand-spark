# Notification rollout — rollback per stage (STAGED, nothing applied)

Each stage is reversible on its own. Roll back the latest stage first.

## Stage 1 — Observe only
Applied: guard in send-fcm/send-webpush with `NOTIFY_AUTH_MODE` unset (= observe); relay checks log only; send-fcm PING branch.
Rollback:
1. Redeploy the previous send-fcm / send-webpush (`git show <pre-stage-1>:supabase/functions/send-fcm/index.ts`).
2. Nothing in the database changed, so there is nothing else to undo.
Check: send-fcm logs no longer show `evt":"notify_auth"`; a test booking alert still arrives.

## Stage 2 — Move legitimate callers
Applied: notify-next-tier + booking-notifications use the service key; watchdog pause payload fix;
keep-alive payload + caller check; DB triggers send `x-internal-key` (`db-triggers/migration.sql`);
keep-alive cron fixed (`keepalive-and-pause/cron.sql`).
Rollback (any order; each is independent):
1. `db-triggers/rollback.sql` — triggers stop sending the header.
2. `keepalive-and-pause/cron-rollback.sql` — job goes back to its current (placeholder) form.
   Faster alternative: `SELECT cron.alter_job(<jobid>, active := false);`
3. Redeploy previous notify-next-tier / booking-notifications / worker-health-watchdog / fcm-keepalive.
Safe because Stage 1 still accepts every caller, so old callers keep working.
Check: test booking alert, a cancellation and a Start OTP reminder cancel each arrive.

## Stage 3 — Enforce
Applied: secret `NOTIFY_AUTH_MODE=enforce` (and relay checks return 401/403).
Rollback (seconds, no redeploy): set `NOTIFY_AUTH_MODE=observe` (or delete it). The guard reads it on every request.
Check: `notify_auth_enforce_refuse` lines stop; any refused legitimate caller found → fix it in Stage 2 before re-enforcing.

## Go / no-go for Stage 3
Only after ≥ 48 h of Stage 2 logs with zero `notify_auth_observe_refuse` lines from real senders.
