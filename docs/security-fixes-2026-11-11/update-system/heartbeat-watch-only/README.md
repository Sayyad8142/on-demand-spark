# worker-heartbeat — recovered live source + staged WATCH-ONLY audit (NOT DEPLOYED)

## Files
- `live-backup/index.ts` — exact deployed source uploaded by owner 2026-11-11 (sha256 fb90ce82…c218). Also `/mnt/documents/worker-heartbeat-live-backup-2026-11-11.zip`.
- `staged/index.ts` — live source + additive audit only (test proves every live line kept, in order).
- `staged/heartbeat_audit.ts` — pure classifier; `staged/heartbeat_audit_test.ts` — 13 Deno tests.

## Live vs project copy (`supabase/functions/worker-heartbeat/index.ts`)
| Area | LIVE | PROJECT COPY (never deployed as-is) |
|---|---|---|
| Identity | body `worker_id` required (400 otherwise); **no auth check at all** | worker_id or JWT fallback; 401 without header; 403 unresolved |
| Worker lookup | `.eq('id', worker_id)` | `user_id OR id` |
| FCM | `repair_worker_push_health(worker_id, token)` RPC | writes fcm_token/status columns directly |
| Reachability | RPCs `compute_worker_reachability` + `recompute_worker_notification_health` | computes push_health_status/notification_health inline, clears stale_device/no_ack_count |
| Extras only live | 20% sampled `worker_heartbeats` log; returns `pending_bookings` (missed-offer fallback); `app_state`, battery/network, overlay/battery status, `device_info` jsonb | — |
| Extras only project | `last_active_at`, `updated_at`, overlay timestamps, token rotation kinds | — |
| Runtime | std `serve` + esm.sh | `Deno.serve` + npm: |

Dispatch impact of deploying the PROJECT copy: removes the reachability RPCs, the repair RPC and `pending_bookings` → could change reachability scores and drop the missed-offer fallback. **Never deploy the project copy.**

## Watch-only change
Logs one line `[heartbeat-audit] {outcome, worker(8 chars), app_version, app_state}` per call.
Outcomes: no_auth_header, legacy_anon, session_match, session_mismatch, session_no_worker, session_invalid, missing_worker_id, audit_error.
Never rejects, never writes the DB, never logs tokens, max +1.5 s wait, swallowed errors. Kill switch: secret `HEARTBEAT_AUDIT=off`.

## Deploy (only after approval)
1. Replace `supabase/functions/worker-heartbeat/index.ts` with `staged/index.ts` and add `staged/heartbeat_audit.ts` beside it (saving auto-deploys).
2. Watch logs for `[heartbeat-audit]` and normal `🔧 Token refreshed…` lines; check 5xx rate.

## Rollback
Fast: set `HEARTBEAT_AUDIT=off` (audit code idle). Full: copy `live-backup/index.ts` back over index.ts and delete heartbeat_audit.ts.

## Notes
- All 44 workers have `id == user_id`, so apps sending either id match the live `.eq('id')` lookup.
- Pre-existing: `usePostBootVerification` calls heartbeat without worker_id → live answers 400 (harmless retry path, not fixed here).

## DEPLOYED 2026-11-11 04:09 UTC (watch-only)
Function folder now = live baseline + audit (`supabase/functions/worker-heartbeat/`). Old project copy kept only as `project-copy-never-deploy.ts`.
First 6 min: 27 audited check-ins, 0 errors; session_match 4 workers, legacy_anon 11 workers, mismatch/invalid/no_header 0. Workers checking in (10 min) 9 → 15; available 15 (unchanged).
