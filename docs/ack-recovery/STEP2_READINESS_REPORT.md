# Step 2 — booking-confirmation receiver readiness (2026-10-22 21:10 UTC)

## Recommendation: NO-GO (do not deploy the staged receiver)

## 1. Live receiver backup — NOT OBTAINED
- This workspace has no Supabase management access, so the deployed source, version and deploy date cannot be downloaded.
- Recorded from here: `verify_jwt = false` in this project's config (live setting itself NOT VERIFIED); function boots normally (logs 21:07–21:09 UTC).
- Owner action: Supabase Dashboard → Edge Functions → ack-booking-delivery → download code; note Verify JWT toggle, deployment id/date. Save to `docs/ack-recovery/LIVE_BACKUP/`.

## 2. NEW finding: the live receiver changed (VERIFIED by harmless probes, fake IDs, nothing written)
| Probe | Earlier (prior audit) | Now |
|---|---|---|
| fake worker_id + `push_received` | 400 "must be received or opened" | **401 unauthenticated — "send ack_token or a valid worker session"** |
| fake worker_id + legacy `received` | accepted path (no auth) | **401** |
| empty body | 400 | 400 missing_event_type |

Meaning: a newer, token-secured receiver has been deployed from outside this project (most likely the Admin Panel phase1b build).
It does not match this project's `supabase/functions/ack-booking-delivery/index.ts` NOR `docs/ack-recovery/staged/handler.ts`
(neither contains that error text, and neither checks `ack_token`).

## 3. Consequences
- The staged receiver here is OUTDATED: deploying it would remove signed-token checks and re-open the forged worker_id hole. NO-GO.
- The Worker App's legacy fallback (old names + worker_id, no token) is now refused (401) by the live receiver. Phones only
  succeed if the push carries `ack_token` (app passes it, Phase 1C) or they have a valid session.
- Older APKs that send neither token nor session will now get 401 → their confirmations are lost. NOT VERIFIED on real traffic:
  no offers have been sent since 08:48 UTC, so no device events exist after the change (last: 05:39 UTC, 6 popup_shown, 16 worker_seen; 0 push_received).
- Booking assignment, availability, dispatch, payments, payouts: receiver change cannot be confirmed safe until its source is reviewed.

## 4. Before any GO
1. Owner exports the live source (above). I diff it against the app's contract (`src/lib/bookingAck.ts`) and the staged version.
2. Confirm `send-fcm`/dispatcher put `ack_token` in every booking push and `ACK_TOKEN_SECRET` is set.
3. First morning offers (from 07:00 IST): check `booking_offer_events` device rows and receiver 401 counts.
4. If push_received is still missing, patch the LIVE version (not the old staged one), test, then request approval.

## 5. Rollback procedure (ready once backup exists)
Restore the exported backup into `supabase/functions/ack-booking-delivery/`, keep verify_jwt=false, redeploy, re-run the
three probes above and confirm the same answers as recorded in §2.

## 6. Admin Panel access tests (diagnostic tables) — prepared, NOT RUN (needs Admin Panel sign-in)
Run in the Admin Panel app with the Supabase client:
```ts
const a = await supabase.from("worker_diagnostic_status").select("worker_id", { count: "exact", head: true });
// admin: no error (count 0 while empty) · non-admin: no error, count 0
const w = await supabase.from("worker_diagnostic_events").insert({ worker_id: "<any>", event_id: "t", kind: "snapshot", observed_at: new Date().toISOString() });
// both: error 42501 permission denied
const r = await supabase.rpc("upsert_worker_diagnostic_status", { p_worker_id: "<any>", p_observed_at: new Date().toISOString(), p_fields: {}, p_logout: false });
// both: error permission denied
```
Signed-out (anon key only): select → permission denied. To prove admins really see rows, a service-role test row is needed
(separate approval; delete afterwards).
