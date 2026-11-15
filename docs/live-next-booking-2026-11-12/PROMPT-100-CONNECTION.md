# Prompt 100 — backend connection verification

## Current result
- HOSTED: POST `/worker-availability-ranking` returned 404 `NOT_FOUND` again. No usable ranking service is reachable at the intended endpoint. Authoritative deployment inventory remains NOT VERIFIED: the management listing command refuses because no management access token is available. A 404 is not proof of exact saved function inventory or version.
- SOURCE: Worker App project is `paywwbuqycovjopryele`; its authenticated invocation names `worker-availability-ranking`. The intended endpoint is `https://paywwbuqycovjopryele.supabase.co/functions/v1/worker-availability-ranking`. Preview network evidence also points to this project. No wrong-project or wrong-function correction is justified by available evidence.
- SOURCE: Existing reviewed implementation found in `staged/index.ts`, `staged/handler.ts`, and `staged/core.ts` here. It verifies Supabase sessions and uses its existing display-only ranking rules. No replacement algorithm was created.
- TEST: Fresh Deno compilation passed; 29 isolated staged security/adapter tests passed. These are not hosted authenticated results.
- SOURCE / PRIOR: UI already includes session refresh and one immediate 401 retry, strict snapshot validation, and connection Retry. Activation flag remains false. Prior frontend suite: 667 passing tests. No new frontend fix is warranted for an unreachable service.
- SOURCE: Hook uses named React imports and contains no quoted instruction-like identifier. Reported TS2686 is not reproduced in source. This turn has no fresh build-error log, so no new compilation result is claimed.

## Exact remaining action
1. Obtain project-scoped management inventory/source access; confirm absence or back up the exact hosted version and authentication configuration before replacement. Confirm required runtime-variable presence without exposing values.
2. Obtain separate approval to deploy ONLY the reviewed `worker-availability-ranking` package to `paywwbuqycovjopryele`, with in-code session verification and explicitly checked gateway configuration (`verify_jwt=false`). No schema or dispatch changes are needed by this package.
3. Verify hosted CORS, refused callers, privacy-safe response contract and actual eligible/ineligible worker results using authenticated sessions. This project's external unmanaged authentication cannot be restored/minted by the sandbox; authenticated end-to-end checks remain unavailable here.
4. Obtain separate approval to enable the existing Next Booking rollout flag only after those checks pass. Do not publish an APK or app as part of this action.

No backend deployment, feature activation, database changes, dispatch changes or published release occurred. Real ranking data is not displaying yet. The supplied logs show successful `get-worker-leaderboard` responses, not `worker-availability-ranking`; they do not verify this separate service.