# Phase 6B — Final Security Release Readiness

Labels: LIVE = read-only query of production catalog (17 Oct 2026); SOURCE = this repo; DRAFT = not applied; NOT VERIFIED = untested.
No deployment, migration, data change, notification or publish was performed.

**Input gap:** `docs/phase5-security-rollout-report.md` does not exist in this project (it belongs to the Admin Panel project). Package A/B contents were therefore re-derived from the live catalog, not from that report.

## 1. Package A — authorization findings and final changes

### LIVE findings (critical)
| Function | Who can call | Problem |
|---|---|---|
| `accept_booking_authoritative(p_booking_id, p_worker_id)` | **anon** + authenticated | If `p_worker_id` is given it is trusted with no session check → **unauthenticated assignment of any worker** |
| `atomic_accept_booking(p_booking_id, p_worker_id, …)` | authenticated | Forwards caller-chosen worker id → **cross-worker acceptance** |
| `admin_set_booking_status(...)` | **anon** + authenticated | No admin check (SECURITY INVOKER, so RLS on `bookings` is the only barrier — NOT VERIFIED) |
| `admin_reassign_booking_worker` | anon has EXECUTE | Has an internal admin check; grant still too wide |
| `repair_scheduled_dispatch_windows()` | **anon** + authenticated | Anyone can trigger scheduled-window reopening |
| `admin_emergency_manual_assign`, `admin_emergency_undo_pauses` | service role only | No internal admin check; safe only while grants stay closed |
| `try_accept_booking(p_booking_id)` | authenticated | Calls the core with `NULL` worker → identity from `auth.uid()` ✓ |
| `reject_booking_offer`, `update_worker_availability`, `set_worker_availability` | authenticated | Session-derived identity ✓ |

### Final Package A (DRAFT — `docs/phase6b/` not created; SQL below is the full proposal)
```sql
-- A1 core: never trust a supplied worker id from a client
REVOKE EXECUTE ON FUNCTION public.accept_booking_authoritative(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.accept_booking_authoritative(uuid,uuid) TO service_role;
-- try_accept_booking stays the only worker entry point (it passes NULL → auth.uid()).
-- Add inside accept_booking_authoritative, before worker lookup:
--   IF p_worker_id IS NOT NULL AND auth.role() <> 'service_role'
--      AND NOT public.has_role(auth.uid(),'admin') THEN RETURN '{"success":false,"error":"forbidden"}'; END IF;
-- and require a pending, unexpired booking_requests row for (booking, worker) unless admin/service.
-- A2 legacy wrapper
REVOKE EXECUTE ON FUNCTION public.atomic_accept_booking(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
-- A3 admin tools: server-side role checks + no anon
REVOKE EXECUTE ON FUNCTION public.admin_set_booking_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reassign_booking_worker FROM PUBLIC, anon;   -- exact signature at apply time
-- add IF NOT public.has_role(auth.uid(),'admin') THEN RAISE ... to admin_set_booking_status,
-- admin_emergency_manual_assign, admin_emergency_undo_pauses (defence in depth).
-- A4 scheduled reopening: cron/service only
REVOKE EXECUTE ON FUNCTION public.repair_scheduled_dispatch_windows() FROM PUBLIC, anon, authenticated;
```
Auto-assign, bulk redispatch and pause-unreachable endpoints live in Admin Panel / edge functions not present in this repo: **NOT VERIFIED**; each must check `has_role(auth.uid(),'admin')` server-side or run as service role only.

## 2. Worker App compatibility dependencies
- 10.0.02 (SOURCE, Phase 6A): calls only `try_accept_booking` / `reject_booking_offer` with user JWT, sends no worker id → unaffected by A1–A4.
- Repo search: no client code calls `accept_booking_authoritative`, `atomic_accept_booking` or `repair_scheduled_dispatch_windows`. Edge functions that call them must use the service role (check before apply).
- 10.0.01, 7.0.4, 7.0.0, 6.0.64: UNVERIFIED.

## 3. Old-version update strategy
- A version string is never authorization. Security comes only from A1–A4: an old client that calls `atomic_accept_booking` or sends a worker id simply gets `forbidden`.
- Measure first: log (not block) which RPC each accept uses for 7 days; old paths show up as `forbidden` counts after rollout.
- Show a clear "Please update to accept bookings" message when an accept returns `forbidden` (needs app release).
- Force update stays OFF until 10.0.02 is live on the Play Store and the update screen is verified on a device.
- No unauthenticated exceptions.

## 4. Background job authentication (LIVE: 12 HTTP cron jobs)
| Job → function | Current auth | Notes |
|---|---|---|
| dispatch-no-ack-fallback (10s) | `apikey` public key only | Function must not accept public key |
| recompute-notification-health (5m) | public key | same |
| dispatch-pending-bookings (1m), dispatch-watchdog (1m), payout-alert-monitor (5m), retry-failed-payouts, check-scheduled-bookings, retry-pending-beneficiaries, snapshot-worker-presence, sync-payout-statuses, worker-health-watchdog | `Authorization: Bearer <stored key>` (value redacted; key type must be confirmed in dashboard) | |
| fcm-keepalive (30m) | placeholder `YOUR_PROJECT_REF` / `YOUR_SERVICE_ROLE_KEY` | **Broken — never reaches the function** |

Replacement: one dedicated secret `CRON_SHARED_SECRET` (random 32+ bytes) stored in Supabase Vault, read by cron via `vault.decrypted_secrets`, sent as `x-cron-secret`; each function compares in constant time and rejects anything else (keep `verify_jwt=false`). Rotation: add new secret → functions accept old+new → switch cron → remove old (quarterly or on leak). Never in apps/frontend.
Rollout per job: deploy function accepting both old and new → switch cron → watch 24h → remove old acceptance. Rollback = restore old cron command (kept in the runbook). Do not disable any job before its replacement runs.

## 5. Emergency containment (smallest safe set)
Only grants, no logic change — applies in seconds and rolls back with a matching `GRANT`:
1. Revoke anon/authenticated on `accept_booking_authoritative` and `atomic_accept_booking` (blocks unauthenticated + cross-worker assignment; `try_accept_booking` keeps working because it is SECURITY DEFINER).
2. Revoke anon on `admin_set_booking_status`, `admin_reassign_booking_worker`.
3. Revoke anon/authenticated on `repair_scheduled_dispatch_windows` (cron runs as postgres, unaffected).
4. Availability: already session-bound (LIVE) — no change needed.
Detection after deploy: alert if `try_accept_booking` returns non-success for >5% of attempts in 15 min, or any `permission denied for function` in API logs; compare accepted-per-hour with the previous 7 days. Response: re-grant the specific function, then investigate.
Dependency to check first: any edge function or Admin Panel call to these functions with a user/anon token (NOT VERIFIED — Admin Panel is a separate project).

## 6. Package B (expiry) readiness
Not reviewable here: the Package B patch is in the missing Phase 5 report. Required properties to verify when provided: server-side offer expiry; no 15s grace; scheduled deadline ≤ start + 60 min, in every dispatch path; admin manual recovery intact; no auto-cancel or money movement.
Instant hard-deadline proposal (DRAFT, inactive): stop re-dispatch at created_at + 30 min, mark `dispatch_status='needs_admin'`, raise ops alert, no cancellation. Behind a `settings` flag, default off.

## 7. Integration tests required (isolated backend + real devices)
Current-app accept; expired/refreshed session; cross-worker accept = forbidden; anon accept = denied; admin tools with admin vs worker token; each cron job with new secret and without; two workers accepting at once (one winner); already-assigned booking; expired offer; rollback grants restore old behavior.
**Blocked:** no isolated Supabase project exists; no real-device run; Admin Panel code unavailable.

## 8. Deployment order
1. Approve. 2. Confirm no caller uses the revoked functions with user tokens. 3. Emergency containment (§5) in a quiet window. 4. Monitor 24h. 5. Package A logic changes. 6. Cron secret migration job by job. 7. Package B after its own review. 8. Force update only after Play Store verification.

## 9. Rollback and monitoring
Rollback per step = the inverse `GRANT` / previous function body / previous cron command, saved before applying. Monitor accept success rate, permission-denied errors, cron function 401s, pending bookings older than 10 min.

## 10. Decision
**NO-GO for full rollout** — isolated and device tests not run, Phase 5 report and Admin Panel unavailable, older versions unverified.
**Emergency containment (§5) is recommended** given the live unauthenticated-assignment hole, pending your explicit approval and a check of Admin Panel callers.
