# Final Reachability Verification — 2026-10-26 (read-only)

Snapshot: 2026-10-26 09:43 UTC. No data, functions or settings changed. Worker IDs shortened to 8 chars; no phones or tokens shown.

## 1. The four ON workers without a notification token

| Worker | Build | Last app open | Last real phone heartbeat | Turned ON by | Token repair events |
|---|---|---|---|---|---|
| 36e1c025 | 7.0.0 | 2026-09-23 | 2026-09-28 | Admin, 2026-10-20 02:43 | none |
| 05395631 | 7.0.0 | 2026-10-03 | 2026-10-03 | Admin, 2026-10-20 02:21 | none |
| 2831a401 | 6.0.64 | 2026-09-05 | none in 30 days | Admin, 2026-10-20 02:43 | 1 (Aug 22, recovered) |
| 107e2aac | 10.0.02 | 2026-10-11 | 2026-10-22 05:00 (1 interval beat) | Admin, 2026-10-20 02:44 | none |

**CONFIRMED — what changed the Oct 20–23 dates:**
- `workers.last_seen_at` is set by a database trigger (`touch_worker_last_seen`) whenever availability, busy, active, services, communities or token changes. The Oct 20 dates match the **Admin Panel "manual online"** times to the microsecond. The phones did not do this.
- So 3 of the 4 (36e1c025, 05395631, 2831a401) have **no phone activity since September/early October**. They show ON only because an admin switched them ON.
- Only 107e2aac (build 10.0.02) sent a real heartbeat recently (Oct 22, background "interval"). Its `last_heartbeat_at` Oct 23 05:34 matches a server-side offer event, not a phone beat (NOT VERIFIED which writer set it).

**Answers:**
- Can background work update heartbeats without a token? **Yes** — the heartbeat path writes separately from token sync (107e2aac proves it: heartbeat Oct 22, token still missing).
- Is token registration attempted in those background sessions? **NOT VERIFIED** — no token-repair or diagnostic event was recorded for any of the four, so either it was not attempted or failures are not logged. Diagnostics server sync is still switched off, so the phone keeps them locally.
- Are failures recorded? **No server record exists** for these four.
- Old versions (6.0.64, 7.0.0) missing token sync? Boot recovery and signed delivery confirmations exist only in newer builds (PRIOR finding). Exact token-sync behaviour of 6.0.64/7.0.0 is NOT VERIFIED (source of those builds not in this repo at those tags).
- Can they recover without opening the app? For 3 workers: **no evidence of any running component** to use. For 107e2aac: its background heartbeat runs, so a token re-register in that same background job could recover it — this is a proposed app change, not done.
- Force-stop: **not assumed**. Evidence is only "no phone activity".

**New risk (CONFIRMED):** 107e2aac received **33 offers in 10 days** (`push_sent`) and all ended `server_not_delivered`/`server_unreachable`. The dispatcher is spending offer slots on a worker it cannot reach.

## 2. Worker counts reconciled

At 09:43 UTC: **23 ON** (all communities) = 19 with token + 4 without. 0 busy. 19 dispatchable.
Earlier "22 ON" was a PHF-only count at an earlier time. Workers toggle themselves many times a day (e.g. 50+ manual ON/OFF in the last 30 hours), and on 2026-10-25 05:03–05:05 an admin switched 7 workers ON. Counts differ by scope and time, not by a bug. Always quote counts with timestamp + scope.

## 3. Production code protection

- Repo `supabase/functions/worker-health-watchdog` holds the outdated 5-minute auto-OFF. Live history shows **zero automatic OFFs in 7 days**, so the deployed version differs. **Do not save or deploy that folder** (saving auto-deploys).
- Deployed source **cannot be retrieved** with the tools available here (also true for `booking-notifications`, `ack-booking-delivery`, `complete-booking-with-otp`).
- Safe retrieval: project owner runs `supabase functions download <name> --project-ref <ref>` on their own computer (read-only), or copies the code from Supabase Dashboard → Edge Functions → function → Code. Commit those copies into a separate `docs/deployed-snapshots/` folder (not `supabase/functions/`) and compare there.

## 4. Festival load-test plan (synthetic only)

Scenarios: 50 workers; 25 and 50 simultaneous bookings; 10 busy; 15-day inactive; missing tokens; many workers tapping Accept on one booking at once.

Check per scenario: every booking gets exactly one worker; no busy, OFF, blocked or tokenless worker is offered; offers per worker stay within the cap; time to first offer; time to accept; no double assignment.

Minimum isolated setup:
- A **separate Supabase project** (Lovable Cloud / Supabase free tier is enough for 50 synthetic workers; ~$0. Supabase Pro ~$25/month only if free limits are hit).
- Schema copied from production with **no real worker data**.
- Deployed dispatcher copy (from step 3), with sending to Firebase replaced by a fake that only records "would send".
- A script that creates the workers and bookings and fires concurrent Accept calls.
- No real phones and no Firebase project needed for the first round.

## Unresolved risks
1. Tokenless ON workers still get offers (wasted slots, slower dispatch).
2. Admin "manual online" can switch ON workers whose phones are unreachable.
3. Deployed watchdog/dispatcher source unknown.
4. Token-registration failures are not visible on the server.

## Required manual actions
1. Admin: contact the 3 inactive workers (36e1c025, 05395631, 2831a401) to open the app or switch them OFF; ask 107e2aac to open the app once.
2. Owner: download deployed function source (method above).
3. Owner: create the isolated test project.

## Recommendation
**NO-GO** for code or deploy changes today. **GO** for the three manual actions, then a proposed fix (after approval): skip workers without a token in the dispatcher, and warn the admin before "manual online" for a worker with no token.
