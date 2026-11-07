# Acceptance functions backup — 2026-11-07 03:40 UTC

Read-only export via `pg_get_functiondef` from the live database. Not executed, not deployed.

| Function | Signature | Security | Execute granted to |
|---|---|---|---|
| try_accept_booking | (p_booking_id uuid) → jsonb | SECURITY DEFINER | postgres, service_role, authenticated |
| accept_booking_authoritative | (p_booking_id uuid, p_worker_id uuid DEFAULT NULL) → jsonb | SECURITY DEFINER | postgres, service_role |
| accept_booking | (p_booking_id uuid) → jsonb | SECURITY DEFINER | postgres, service_role |

anon and PUBLIC have no execute on any of them. Worker App path: try_accept_booking → accept_booking_authoritative.
