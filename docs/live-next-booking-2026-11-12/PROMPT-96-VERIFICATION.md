# Next Booking — final secure backend verification

## Verdict
**Conditional GO for deploying only `worker-availability-ranking` after explicit approval; NO-GO for live UI activation or publishing.** Nothing has been deployed or activated in this task. No production record, schema, dispatch, booking, availability, payment, OTP or notification changes occurred.

## Security audit — SOURCE + isolated tests PASS
- Supabase `auth.getUser(caller JWT)` verifies the session with Auth before privileged reads. Only non-anonymous `authenticated` users qualify. Exact `workers.user_id = verified.user.id` linkage is required; absent or duplicate linkage returns 403. No JWT decode-only, phone matching, fallback worker or client-supplied worker identity.
- Frontend SOURCE uses its actual current Supabase session's access token and checks the session user matches the account. Integration flag remains false. **Hosted logged-in response NOT VERIFIED**, not claimed from source or mocks.
- Strict Zod selectors: optional community and `maid`/`bathroom_cleaning`, unknown keys rejected, null rejected, malformed JSON returns 400, streaming body limited to 2048 bytes. Authorized values come solely from the worker's server-stored community/service arrays; cross-community/service requests return 403.
- Client cannot broaden server filters. Server queries community membership and supported service, saved current-day/current-slot availability, active/unblocked/ON/free flags, and assigned non-terminal bookings. NULL booking status is conservatively busy. Missing flags/scores fail closed. Missing or ambiguous membership cannot silently fall back to a different society.
- IST uses UTC+05:30; Thursday 14:10 maps to Thursday 14:00–14:30; exact 14:30 boundary and IST midnight tested. No dispatch helper or ordering changed.
- Ranking: `priority_score DESC`, `rating DESC`, stable worker `id ASC` internally. Zero values preserved. IDs do not leave the server.
- Response top-level allow-list: `version`, `updatedAt`, `slotStart`, `slotEnd`, `community`, `service`, `communities`, `services`, `reason`, `rows`. Each row only `rank`, first display `name`, `priority`, `rating`, `isMe`. Available status is implicit for all included rows; only the caller's unavailability reason is included. No phones, push tokens, worker/user IDs, photos, private schedules or customer details. Server selects no OTP/contact/token fields. Generic errors, no sensitive logging.
- SDK CORS headers on every response; no-store caching. Service credentials remain only in server environment. Paginated 500-row reads refuse at cap rather than silently truncating. Per-network timeout 8 seconds; total slow/slot-rollover reads refuse. No writes or RPC/dispatch/function calls in the adapter.

## Changes made to the staged package
- `staged/index.ts`: minimal Deno entrypoint.
- New `staged/handler.ts`: injectable network adapter used by production entrypoint and isolated tests; verified Auth, strict bounded validation, SDK CORS, narrower selects, network timing, conservative NULL-status handling.
- New `staged/handler_test.ts`: 29 Deno tests using the real Supabase JS query/HTTP adapter against intercepted fake responses; no production network requests.
- New `staged/deno.lock`: isolated dependency lock, not app dependency changes.
- Existing `staged/core.ts` unchanged; backup checksums for original entrypoint/core verified.
- `roadmap.md`, `src/lib/AGENTS.md`: verification status and architecture rule; frontend runtime files unchanged.

## Verification performed
**PASS — Deno 2.8.3 check** of entrypoint + tests with `--no-config --node-modules-dir=none`, proving imports resolve independently of app packages.

**PASS — 29/29 Deno tests, 0 failures:** CORS, missing/forged-or-expired/anonymous login, missing/duplicate worker, malformed/oversized/unknown-ID/null/service input, community/service refusal, first-name privacy allow-list, GET-only/dispatch independence, busy override, database-error masking, pagination past 1000, rollover refusal, missing config, IST slot/day, OFF/busy/blocked/inactive/community/service/no-slot exclusion and all three ordering criteria.

**PASS — 38/38 app targeted tests:** 24 core/contract, 10 reader/lifecycle, 4 existing ranking. **PRIOR — 606 full-app tests passed earlier; not rerun for this docs-only server preparation.**

**PASS — latest preview build OK; hook error NOT REPRODUCED.** `use-mobile.tsx` already has named React imports and does not contain the quoted instruction-like identifier. No unnecessary hook edit.

**LIVE READ-ONLY compatibility check:** 45 workers; 0 missing user links, 0 empty community arrays, 0 unknown required flags. Assigned bookings currently only completed/cancelled (517/123). This is a point-in-time schema/data compatibility signal, not authenticated endpoint verification or proof of every future booking status.

## Remaining blockers and limitations
1. **Deployment requires your separate approval.** Endpoint is not installed; caller feature switch stays OFF.
2. **Hosted credential/auth checks pending:** custom-secret name lookup exposes no managed Supabase URL/anon/service-key values. These standard managed environment variables are expected on Supabase, but their deployed availability is not proven here. The service returns 503 if absent; never insert/reveal keys in source.
3. **Real worker test unavailable here:** externally managed Supabase has no injected authenticated test session. After approval/deployment, use a named worker's actual session on their device for success, auth denial and privacy tests. Never use the service-role key as the caller token.
4. **Snapshot is not transactional:** separate reads can race availability/booking changes. This is a recent informational snapshot, not dispatch/acceptance eligibility authority. Slot-change/slow-read refusals reduce staleness but do not make reads atomic. No schema/function changes were introduced to conceal this limitation.
5. Membership-array default selects first assigned community/service; stale `selected_community_id` is intentionally not authority. If a selection rule changes, review it separately.
6. **Operational load:** up to 15-second polling per visible caller, bounded reads but no shared distributed rate limiter. Confirm latency/cost on the deployment-only endpoint before activation; do not expose the UI publicly as a dispatch queue.
7. Existing legacy leaderboard's unsafe authentication remains a separate unresolved concern; unchanged as requested. This service does not reuse it.

## Exact deployment-only procedure — not executed
1. Obtain explicit approval for **this endpoint only**, without enabling UI, publishing or changing schema. Confirm target `paywwbuqycovjopryele` and whether an endpoint with that name already exists; save any deployed source/settings before replacement.
2. Confirm managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are present server-side. No third-party secret needed.
3. Re-run:
   ```sh
   deno check --no-config --node-modules-dir=none --lock=docs/live-next-booking-2026-11-12/staged/deno.lock docs/live-next-booking-2026-11-12/staged/index.ts docs/live-next-booking-2026-11-12/staged/handler_test.ts
   deno test --no-config --node-modules-dir=none --lock=docs/live-next-booking-2026-11-12/staged/deno.lock --allow-env --allow-net docs/live-next-booking-2026-11-12/staged/handler_test.ts
   ```
4. Deploy only package files `index.ts`, `handler.ts`, `core.ts` plus lock as the function `worker-availability-ranking`, using the approved deployment tool. All imports stay inside the package; no `src/` or sibling-function dependencies. Use in-code verification with platform JWT gateway verification disabled for the signing-key model. **Do not copy into auto-deploying `supabase/functions/` before approval.** No database migration is needed.
5. With integration still OFF, verify hosted OPTIONS/CORS; missing/invalid JWT 401; actual worker JWT success; wrong community/service 403; malformed input 400; PII allow-list; busy/OFF/blocked/no-slot; scope choices and fresh slot timestamps. Check server logs for generic failures only.
6. Observe latency/error rate and confirm managed credentials; keep integration OFF if any check fails. Roll back only this endpoint to its saved version (or remove the newly created endpoint) after approval, never alter dispatch.
7. Return hosted PASS/FAIL evidence and request **separate activation approval**. Endpoint deployment alone does not authorize live UI activation, APK or publication.

Deno compilation here means static type/import checking plus executed isolated runtime tests, not a deployed Supabase smoke test or Android compilation.