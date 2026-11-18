# Next Booking — complete activation readiness audit

18 November 2026. Scope: read-only production inspection and development-only display safety fix. No activation, deployment, dispatch change, notification send, APK build or publication.

## Decision: NO-GO for production activation

| Required answer | Result |
|---|---|
| Why disabled? | Intentional approval gate: `src/lib/nextBooking.ts:2` exports `NEXT_BOOKING_LIVE_ENABLED=false`. `NextBookingRanking` passes `flag || preview` to the reader. `isPreviewVerificationHost` returns false on native platforms even on localhost, so Android cannot use the browser-preview exception. |
| Backend fully functional? | Endpoint presence/reachability and unauthorized refusals verified. Authenticated ranking, deployment version and complete security enforcement NOT VERIFIED. |
| Ranking accurate? | NOT VERIFIED. No hosted ranking/dispatcher source available for parity comparison; the old staged priority/rating service is a different algorithm and contract. |
| What remains? | Hosted source/contract review, approval/readiness enforcement, isolated authenticated scenario matrix, dispatch group comparison, explicit activation approval, new synchronized Android build and phone tests. |
| APK update needed? | Yes for releasing this locally bundled implementation and changing its compiled OFF gate. Installed APK contents/version are NOT VERIFIED; repository bundled assets lack the `worker-next-booking` marker. |
| Production-ready? | No. Frontend regression tests pass, but server parity and real-worker/device checks remain blocked. |

## Evidence labels

- SOURCE: inspected repository source, not proof of hosted code or device behavior.
- HOSTED: fresh HTTP/database read from production, without mutations.
- TEST: isolated/mock automated result, not a production dispatch result.
- PRIOR: previously observed result, not retested with a current login.
- PROPOSED / NOT VERIFIED: approval-gated follow-up or missing evidence.

## Hosted endpoint, identity and privacy

- HOSTED at approximately 04:44 UTC: `https://paywwbuqycovjopryele.supabase.co/functions/v1/worker-next-booking` POST `{}` without authorization returned 401, `{"ok":false,"error":"unauthorized"}`. A forged token also returned 401. OPTIONS from `https://partner.didisnow.com` returned 200 with POST/OPTIONS and authorization/apikey/content-type allowed. CORS is `*`, not an authentication mechanism.
- Endpoint responds; this is not management-inventory or deployment-version verification. No management credential or hosted source download was available.
- SOURCE: worker's Supabase session only; account match, expiring-session refresh, one 401 retry; no worker ID in request. Known response fields only are retained, unsupported services and stale/future snapshots refused. Own-worker and own-availability realtime subscriptions refresh the reader.
- PRIOR: a preview HTTP 200 response contained `snapshot_at`, `estimate_only`, `ranking_mode:longest_waiting`, and `areas`; the observed worker was excluded for `notifications_off`, with null `groups_ahead`. This proves neither a current eligible position nor dispatcher parity.
- NOT VERIFIED: successful authenticated current-worker response; cross-society/service refusals, no privileged/PII fields in actual current responses, readiness and approval enforced inside the hosted edge function, server errors/timeouts, and server-authenticated identity before privileged reads.
- External unmanaged Supabase cannot supply a managed preview session. No credentials were requested, no account was impersonated, and production workers were not altered to manufacture test scenarios.

## Actual production ordering and approval findings

- HOSTED: `ops_settings.dispatch.uniform_ranking=true`; `dispatch.connection_freshness_hours=0`. `worker_connection_fresh` defines zero as no connection-age limit. Do not claim heartbeat age excludes workers in this configuration.
- HOSTED: `get_dispatch_eligible_workers` checks active/available/not busy/not blocked, token non-null, society/service membership and saved IST slot; orders by full name. The count sibling has similar filters. Neither definition directly checks `approval_status`, `availability_requires_approval`, or notification permission/token health.
- HOSTED: another helper, `get_eligible_workers`, uses different weekday conversion, permissive null-busy handling, 30-minute seen-age filtering and rating/freshness ordering. Multiple helpers cannot establish which rules the hosted dispatcher actually uses. Do not choose one as authoritative without its caller source.
- HOSTED: `accept_booking` resolves the session's worker, checks an active targeted offer, then calls `accept_booking_authoritative`. The latter checks active, blocked, payout readiness, availability, targeted offer, service and society. Its inspected definition has no direct approval-status check. This is a defense-in-depth gap, not proof that a particular unapproved worker has accepted a booking.
- HOSTED: the availability trigger protects new-worker pending status and prevents switching ON when approval is required; `worker_approval_allows_online` allows legacy-exempt statuses other than rejected, while the frontend also excludes suspended. Reject/suspend revocation and all older-APK paths require review beyond toggle enforcement.
- HOSTED aggregate at audit time: 46 workers approved, all legacy-exempt (`availability_requires_approval=false`), 17 available, zero busy. This differs from earlier pending-worker observations; no changes to these rows were made by this audit. There are no current pending/busy production rows in this aggregate to use for the requested scenario matrix.
- SOURCE: the repository retry dispatcher differs from the version shown in supplied live logs. Local edge-function files are not hosted parity evidence and were not edited.
- SOURCE: the independent staged `worker-availability-ranking` service sorts priority, rating, ID and lacks approval/notification-readiness fields in its Candidate contract. Its passing security tests do NOT make it a suitable replacement for the current group-based `worker-next-booking` endpoint. Do not deploy it as an activation fix.

## Development fix and scenario tests

Previously `areaPosition` displayed a numeric position even if the same server area said `not_in_queue` or supplied an exclusion reason. It now hides the position on either exclusion. This is display-only, never an availability, offer or acceptance authorization decision; no UI design or live dispatch behavior changed.

| Scenario | Verified result | Limit |
|---|---|---|
| Eligible, no exclusion, server groups=0 / 3 | TEST: Next Group / 3 groups ahead | Mock contract; actual eligible server response NOT VERIFIED |
| Busy | TEST: no position even with contradictory groups=0; staged busy flag/assigned booking exclusion passes | Hosted busy worker flow NOT VERIFIED |
| Availability OFF | TEST: no position even with contradictory groups=0; staged OFF exclusion passes | Hosted worker state not changed |
| Pending approval, rejected, suspended | TEST: each exclusion hides queue position; existing worker-approval gate tests pass | Does not establish hosted endpoint/dispatcher enforcement |
| Notifications OFF, no slot, inactive | TEST: each exclusion hides contradictory position | Phone readiness and real server exclusions NOT VERIFIED |
| Society/service mismatch | TEST: old staged adapter refuses unassigned scope; current parser refuses unsupported service | Current hosted cross-scope authorization NOT VERIFIED |

- TEST: 65 focused tests pass (42 reader/display, 18 hook, 5 worker approval).
- TEST: full app suite 710 tests across 65 files passes.
- TEST: staged alternative Deno compilation and 29 isolated tests pass; alternative endpoint only, NOT hosted `worker-next-booking`.
- PREVIEW: current build log says build OK at 04:45:47 UTC. Browser `/leaderboard` redirects to rendered `/auth` at 393×805 and 1280×1800, no page errors or horizontal overflow. Screenshot confirms sign-in; signed-in ranking was not verified.
- SOURCE: reported `use-mobile.tsx` TS2686 text is not in the hook; it has explicit React imports, line 4 is blank. Error not reproduced; no speculative hook changes made.

## Approval-gated backend handoff — no deployment

1. Obtain exact hosted `worker-next-booking` and current dispatcher source/version and request/response contract. Identify the actual shared eligibility and group-order path, including uniform ranking, longest waiting, group size, ties, starvation and customer-preferred reservation exceptions.
2. In an isolated development backend, apply the same approval predicate to ranking eligibility, actual dispatch and every acceptance entry point. Preserve approved/legacy-pending exemption decisions, but reject suspended/rejected regardless of exemption; new pending workers never qualify. Do not silently retrofit live dispatch from this project.
3. Verify notification readiness definition with the actual dispatch owner. A non-null token alone is not proof of Android permission/token delivery health. Do not add a new dispatch gate without separate approval.
4. Test separate approved eligible, busy, OFF, new pending, rejected, suspended and legacy-pending accounts. Check unrelated societies/services cannot be requested; excluded areas have null positions. Reopen/resume and approval change must refresh without turning availability ON automatically.
5. Against a fixed isolated IST slot and unchanged candidate set, compare returned groups to actual dispatch decisions, including equal waits, slot boundary, batch size, active offers, preferred-worker reservations and starvation. Do not send real production offers for this audit.
6. Only after these pass, request separate approval to activate the Android reader and deploy any reviewed server fixes. Preserve existing timing, notifications, OTP and ranking behavior; record rollback as restoring the OFF gate.

## Android release handoff

- SOURCE: `capacitor.config.ts` uses `webDir:dist` with no hot-reload server URL; app package `app.didisnow.worker`; version 10.0.03/build 103 in both source and Gradle. OTA delivery remains separately gated; not an assumed release path.
- SOURCE: checked-in Android web assets lack current endpoint markers. No APK/AAB was supplied; file timestamps and source version do not establish installed content.
- NOT VERIFIED: native compilation in this environment (Java unavailable), actual installed APK, real-phone startup, foreground/resume refresh, availability approval and ranking rendering, or server-to-dispatch accuracy.
- After approval: update your local project from the connected repository, build the web assets, then run `npx cap sync android`, rebuild the Android package and test it on an isolated phone before publishing. Inspect the final package to confirm current endpoint and approved flag behavior; assign the release version/build through the existing process.
- Native setup reference: https://lovable.dev/blog/capacitor

Nothing activated, deployed, sent or published. Frontend ready for further verification; production activation remains NO-GO.