# Worker Focus diagnostics — Worker App changes + backend handoff (2026-10-22)

Status: Worker App code done and tested. Backend receiver + Admin Panel view are
**STAGED ONLY — NOT APPLIED, NOT DEPLOYED** (needs explicit approval).
Nothing here changes dispatch, ranking, busy state, availability, payments or payouts.

## 1. Audit — what already exists (REUSED)
| Need | Existing source (SOURCE) |
|---|---|
| Last heartbeat / app version / permission / overlay / battery | `worker-heartbeat` edge fn → `workers.last_heartbeat_at`, `app_version`, `notification_permission`; `worker_heartbeats` rows |
| Push token registered / refresh / send / fail | `workers.fcm_token_status`, `fcm_token_updated_at`, `last_fcm_token_refresh_at`, `fcm_last_send_at`, `fcm_last_fail_at`, `fcm_last_fail_reason` |
| Offer sent vs received vs popup vs seen | `booking_offer_events` (push_sent from trigger; push_received/popup_shown/worker_seen from `ack-booking-delivery`, signed ACK + legacy fallback) |
| Missed-booking device snapshots | `report-missed-booking` → `worker_missed_booking_diagnostics` |
| Selected slots | `worker_availability(day_of_week, slots[])` |
| ON/OFF, busy, blocked, payout | `workers.is_available, is_busy, is_blocked, payout_ready`; `worker_status_history` |
| Accepted / completed | `bookings.worker_id, status, completed_at` |

## 2. Worker App — NEW (this change)
- `src/lib/workerDiagnostics.ts` (pure, tested): activity buckets (15m / 1h / today / 1d / 2d / 3d / 7d+ / unknown);
  device reach (`connected` ≤45 min, `last_seen` ≤6 h, else **"Device unreachable — reason unknown"**, never "switched off");
  network state (online only with recent real server contact); explicit logout vs expired session; slot state in IST
  (selected now / not selected now / none / invalid / outside 07:00–19:00); offer diagnosis
  (`no_offers_sent` is never a notification problem; `sent_not_confirmed`; `received_popup_missing`; `delivered`; `unknown` without evidence);
  self-help list; dedupe/newer-wins/throttle rules; event builder that strips token/secret strings.
- `src/lib/diagnosticsSync.ts`: on-phone queue (max 50, deduped, survives no internet), flush removes only server-confirmed ids.
  `DIAGNOSTICS_SERVER_SYNC_ENABLED = false` — no server writes until §3 is deployed. Queue cleared on logout.
- Status card: new "Working slots" row; self-help buttons (Open notification settings, Retry registration,
  Select working slots, Log in again, Retry, Check internet); exact text
  "Booking alerts are disabled. Please enable notifications to receive new bookings." (en/hi/te).
- Network lost / restored are recorded locally.

## 3. PROPOSED backend (not applied)
### 3a. Tables
```sql
create table public.worker_diagnostic_events (
  id bigserial primary key,
  worker_id uuid not null references public.workers(id) on delete cascade,
  event_id text not null,                 -- client dedupe key
  kind text not null,
  observed_at timestamptz not null,       -- phone time (UTC)
  received_at timestamptz not null default now(),
  data jsonb not null default '{}',
  unique (worker_id, event_id)
);
create table public.worker_diagnostic_status (
  worker_id uuid primary key references public.workers(id) on delete cascade,
  observed_at timestamptz not null,       -- freshness of this snapshot
  received_at timestamptz not null default now(),
  network text, notification_permission text, token_registered boolean,
  slot_state text, app_version text, session_state text,
  last_logout_at timestamptz, last_sync_at timestamptz
);
grant all on public.worker_diagnostic_events, public.worker_diagnostic_status to service_role;
grant usage, select on sequence public.worker_diagnostic_events_id_seq to service_role;
alter table public.worker_diagnostic_events enable row level security;
alter table public.worker_diagnostic_status enable row level security;
create policy "admins read events" on public.worker_diagnostic_events for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins read status" on public.worker_diagnostic_status for select to authenticated using (public.has_role(auth.uid(),'admin'));
grant select on public.worker_diagnostic_events, public.worker_diagnostic_status to authenticated;
```
Newer-wins upsert (service role only):
```sql
insert into public.worker_diagnostic_status as s (...) values (...)
on conflict (worker_id) do update set ... where excluded.observed_at > s.observed_at;
```
### 3b. Receiver `report-worker-diagnostics` (edge fn, staged — do NOT place under supabase/functions until approved)
- Verify Firebase ID token (Admin SDK, existing pattern); resolve worker by `user_id = uid` server-side. Ignore any client `worker_id`.
- Body: `{ events: DiagnosticEvent[] }` max 50; reject keys matching token/secret/jwt; `observed_at` must be ≤ now+5 min and ≥ now−7 d.
- Insert events `on conflict do nothing`; return `{ acceptedIds }` (inserted + already-present).
- Rate limit: 1 snapshot per worker per 15 min unless `kind != 'snapshot'`.
- Logout: app sends `explicit_logout` **before** sign-out (needs the token); after sign-out nothing is sent.
### 3c. Admin Panel "Worker Focus" view (admin-only RPC, server-computed)
`admin_worker_focus()` returns per worker: community, account status, is_available, is_busy, last_heartbeat_at,
last_app_opened_at, app_version, notification_permission, fcm_token_status (status only — never the token),
last_fcm_token_refresh_at, last push_sent / push_received / popup_shown (from `booking_offer_events`),
last accepted / completed booking, today's slots, diagnostic status + `observed_at`, activity bucket.
Eligibility is computed server-side; client fields are display evidence only. Display times in IST (`at time zone 'Asia/Kolkata'`).

## 4. Accuracy limits (NOT VERIFIED / cannot be verified)
- "Phone switched off", force-stop, OEM battery kill: indistinguishable from no signal → shown as "Device unreachable — reason unknown".
- Push receipt is only known when the phone reports it; since 2026-10-14 the deployed ACK receiver rejected new event names (fallback shipped in app, not yet on phones).
- Offline events are only sent after the receiver exists; phone time can be wrong (server clamps).
- Existing logout already sets `is_available=false` and clears the token (pre-existing behavior, unchanged).

## 5. Tests
`bunx vitest run` → 151/151 passed (17 new in `src/lib/__tests__/workerDiagnostics.test.ts` covering scenarios 1–12).
Android compile: NOT RUN. Live phone tests: NOT RUN (production backend only; not allowed without approval).

## 6. Deployment
Nothing deployed, published, migrated or changed in live worker data.
