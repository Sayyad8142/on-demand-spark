# Didi Now Worker Priority V4 — Phase 3 draft-only report
**15 October 2026 · DRAFT ONLY · Nothing deployed or activated**

Evidence labels: **SOURCE** = repository/report inspected, not deployed parity; **DRAFT** = proposed file, not installed; **EXECUTED PURE** = synthetic local test observed; **NOT VERIFIED** = no environment/permission/device evidence. The previously reviewed Phase 2 candidate is retained: caps 30/25/20/15/10; priors 18/15/12/9/6; additional penalty zero. Approval to prepare drafts is not approval to execute migrations, change scores or dispatch.

## A. Files created or modified
All new files are under `docs/priority-v4/`:
- `AGENTS.md`: draft architecture/isolation rules; root architecture file intentionally unchanged.
- `roadmap.md`: scoped checklist and blocked execution tasks.
- `sql/001_registry.sql`, `002_canonical_evidence.sql`, `003_opportunities.sql`, `004_calculations.sql`, `005_immutability_projection.sql`, `README.md`.
- `engine/rational.ts`, `engine/calculate.ts`.
- `security/contracts.ts`, `PATCH_DRAFTS.md`, `ANDROID_COORDINATION.md`.
- `tests/fixtures.ts`, `tests/engine.test.ts`, `tests/TEST_SPECIFICATIONS.md`.
- `DEPENDENCIES.md`, this report.
No existing application, native, Edge Function, package, Supabase configuration or root file was edited. No application imports these drafts. Temporary preparation/test logs live under `/tmp`, not app code. No extra Files copy/source archive requested or created.

## B. SQL migration drafts
Five ordered, transactional, **nonexecuted** SQL files describe 16 public v4-prefixed tables:
1. Immutable formula versions and synthetic evidence batches.
2. Canonical assignment outcomes/revisions, business-key unique fault incidents/revisions, effective quality observations/revisions.
3. Unique per-round offer opportunities, multiple stable-ID visibility intervals, explicit-ON availability intervals with nonnegative duration/fulfilled bounds and Maid/Bathroom Cleaning service scope.
4. Lifetime onboarding progress, immutable calculation history, rebuildable current score pointer, review queue and bounded calculation jobs.
5. Append-only triggers, indexes and restricted invoker-rights projection publisher with per-worker/formula transaction lock and stale/equal-as-of protection.

Each CREATE TABLE immediately has explicit service grants, client revocation, RLS enablement, then a server policy. No anon/authenticated reads/writes. Private helper execution is revoked from PUBLIC/anon/authenticated. This does not make a service-role endpoint authorized: caller verification remains obligatory. No live workers/bookings FKs or new workers score fields. Formula caps/priors and locked O/A are constrained; audit history is append-only. Projection stores a same-worker/formula calculation pointer rather than independently writable totals/components.

**Every migration contains an explicit nonproduction guard** before DDL: fixture database must be named `isolated_v4_fixture`, session environment must be `isolated-synthetic`, expected database must match, and approval reference must be present. Unknown/missing assertions fail closed. A usual hosted database named `postgres` intentionally cannot apply these drafts. Guard assertions do not cryptographically prove isolation and privileged owners can bypass them: separately approved runner/target/credential validation remains mandatory. Do not loosen a guard merely to apply to the currently connected project.

**Static review observed:** all five files have guards and transactions; all 16 tables have grant-before-RLS/policy structure. No SQL was parsed/applied or schema/permission behavior tested. Formula/batch/config alignment, revision supersession, canonical known-at projection, total rational-decimal consistency and onboarding provenance remain server adapter validations. Same-as-of corrections await monotonic revision policy. Publish helper is not a full calculation orchestrator; no cron/jobs execute. Stored duration expression and role/schema usage require isolated DB tests.

Rollback guidance is review-only: transactional failure rollback, approved synthetic archive/reset in reverse dependency order, no destructive audit teardown script. Later production rollback disables V4 consumers/pilot while retaining evidence and security; never restores unsafe grants or alters in-flight offers.

## C. V4 calculation engine draft
`calculate.ts` is pure: fixed caller-supplied safe-integer epoch timestamp, canonical synthetic inputs, no current-clock/service/environment access, no production imports. `rational.ts` uses exact BigInt fractions and declares nonnegative ROUND_HALF_UP total rounding once. Output provides formatted total, approximate components, exact component fractions, exclusions, formula identifier and lifetime provisional count.

- **R:** trailing 30-day resolved outcomes; success=1, worker cancellation=0.35, no-show=0; verified late=0.75 only if explicitly approved. Positive mass cap 20, fault cap 5; target `30*(3+U)/(5+W)`, maturity `(n-5)/5` clamped. Unsafe attribution holds 18. No separate fault penalty.
- **Q:** trailing 90-day genuine 1–5 integer ratings, utility `(rating-1)/4`, mass cap 50; target `25*(6+U)/(10+W)`, same maturity. Complaint replacement is deliberately excluded until mapping approval; unsafe provenance holds 15. No artificial stars or duplicate R complaints.
- **O:** exactly **12**, hard locked in this revision. Canonical opportunity validation/onboarding is prepared, not the unlocked responsiveness formula. Confirmed accept/reject while open may count without visibility; otherwise trusted continuous actionable interval at least 15s. Sent-only/unverified/offline/unavailable/failed/early-withdrawn claims excluded. 15s is a candidate criterion, not a live timer change.
- **J:** 168h decayed unique genuine completions, target 15 at effective five, maturity from trusted weekly opportunity count, floor 9. Untrusted opportunity coverage holds 9.
- **A:** exactly **6**, hard locked. No interval-duration adapter or unlocked availability formula executed. No availability toggle, location collection or state mutation.

No valid evidence reproduces **60.00 exactly**. Duplicate identical business-key evidence collapses; conflicting duplicates all quarantine independent of order. Future/invalid timestamps and unverified/test evidence cannot lower scores. Lifetime opportunity maturity survives rolling-window aging. Adapters must supply adjudicated known-at snapshots and canonical business keys: the pure module does not authenticate raw claims. No current total is used as an input and no rewards accumulate across recalculations.

## D. Security patch drafts
`PATCH_DRAFTS.md` gives targets and proposed handler/mutation contracts, not applied patches:
- Inventory broad grants and all profile/registration writers before replacing worker INSERT/UPDATE/upsert with safe allowlisted verified operations; both scores and protected scoring inputs denied. Preserve real name/photo/manual-UPI flows. No guessed production privilege migration.
- Verify Firebase ID tokens cryptographically, uniquely resolve worker, enforce request owner/booking/round relationship, allowlisted bounded append-only events and minimal redacted responses. Public anon bearer/body identity/decode-only JWT cannot authorize telemetry. Adjacent heartbeat/keepalive/missed-booking claims stay untrusted for V4 until separately hardened.
- Leaderboard removes decode-only/fallback real-worker access; server community scope, isolated synthetic guests, approved aliases/minimal permitted metrics, null-aware scores. Memory privacy restrictions override an earlier suggestion to expose full names. Existing V2 authority remains until separate display approval. External admin identity authority is not invented.
- Canonical business-key fault dedupe with immutable revisions; uncertain generation/attribution goes to review; no second additive/cross-lane deduction.
- ACK status projection retains raw status/time/writer/provenance. Accepted/rejected require authority; timeout is lifecycle only, technical statuses are not fault; acceptance-backfilled ACK is derived, not independent latency proof.

Pure `contracts.ts` illustrates already-verified actor binding, provisional profile allowlist and normalization only. It is **not** token verification, effective RLS or deployed endpoint security. No vulnerability is claimed fixed.

## E. Tests prepared and actually executed
**EXECUTED PURE:** Bun 1.3.3 ran only `docs/priority-v4/tests/engine.test.ts`: **24 passed, 0 failed, 307 assertions**. Output captured at `/tmp/v4-tests.log`. Separate source isolation check reviewed five pure local files/imports and rejected service/environment/dynamic imports and transport capabilities. Runtime environment was scrubbed with `env -i`, temporary HOME, no credentials/session/project wiring, no application/Vitest setup, no installs or external requests. Isolation is based on reviewed pure code and denied capabilities in that code, **not** an OS network sandbox.

Actual cases: exact new-worker prior; unverified neutral; five/ten assignment and onboarding thresholds; successful work; attributed cancel/no-show; duplicate/conflicting faults; confirmed accept/reject; sent-only/unverified/offline/unavailable/failed/withdrawn offers; 15s boundary; O/A locks; trusted recent-job reward/floor; fault/quality aging and lifetime onboarding; invalid/future timestamps and ratings; unsupported complaint exclusion; exact rounding; bounds/permutation determinism; simultaneous pure-call determinism; mock profile tampering/identity/offer ownership/legacy anon denial/status normalization.

**Prepared but NOT EXECUTED:** SQL migration/application/constraints, real effective GRANT/RLS tampering, registration/profile compatibility, actual Firebase signature/revocation/project validation, DB concurrent dedupe/locking/replay/rollback/atomic onboarding, independent reference/database parity, unlocked O/A duration/latency/attribution, full supported Android/reboot/Doze/watchdog flow, external Admin/User App contracts, any historical import/ranking simulation. Parallel pure calls do not prove database concurrency. Mock actor tests do not prove deployed authentication or score protection. No existing OTP/payout/dispatch suite or physical phone test run or claimed.

Available app diagnostic log after draft preparation reports **build OK**; runtime-error log is absent. This is not hosted-auth/device evidence. The previously resolved use-mobile issue was not reopened and no hook was edited.

## F. Android compatibility requirements
Current source ACK transport uses anon bearer plus cached worker identity; 401/403 retryability and watchdog cancellation on ACK success are compatibility dependencies, not acceptable identity proof. Backend-only authentication tightening is unsafe.

Proposed coordinated versioned native/web transport obtains fresh Firebase token, pins original account/request/generation/stable event, defines one refresh retry and permanent-error/TTL handling, preserves aliases and late-owned-offer retry. Logout/account change cannot relabel queued evidence. Killed/background token feasibility needs phone/security review; only if separately approved, a server-issued short-lived single-offer scoped capability may cover limited diagnostic delivery, never accept/reject/score/health/payout authority or attention proof. No static/shared client signing secret.

Legacy claims remain quarantined, cannot update trusted evidence/health/request timestamps. Safe diagnostic response and watchdog semantics must be coordinated/tested instead of silently treating anonymous claims as trusted. Confirm tray/FIFO queue/dedupe/manual-OFF/busy behavior and nonblocking Accept/Reject on old/new clients before any live cutover. No aliases removed, native files changed, new permissions or forced updates introduced. Device behavior NOT VERIFIED.

## G. Test environment blockers
- Named independently approved isolated hosted/local database owner/connection and production deny guard are absent; current linked project is not assumed test.
- Fixture database roles/schema/extensions/migration runner and target-specific guard adaptation not verified.
- Isolated Firebase actor/revocation/admin-role authority harness, transport stubs and actual safe profile field inventory absent.
- Sanitized known-at canonical generation/attribution and trusted O/A coverage not established; no production data imported.
- Independent math/persistence parity, atomic transaction adapter and same-as-of correction policy unfinished.
- Physical old/new Android ACK lifecycle harness and external Admin/User App identifiers/owners not verified.
- Privacy/retention, lateness/complaint policy, trust coverage threshold and adjudication owner approvals needed.
These blockers do not stop draft-only pure tests, but prevent SQL/auth/concurrency/device/production readiness claims.

## H. Implementation and deployment dependencies
Exact preparatory order: target/owner/identity/grants inventory → backend security/versioned quarantine contracts in isolation → paired native/web compatibility and device validation → isolated V4 schema/engine/atomic adapter → external Admin inspection/correction tools → separately approved prospective shadow → separately approved controlled dispatch pilot → optional worker display/wider release.

The backend/native stages are coordinated; stage order does not authorize tightening a live ACK before native compatibility. **Another Lovable Admin Panel project** is required for inspection/adjudication tools. **Customer/dispatch owning project** must be identified; potential external User App/shared backend contract changes require that owner's review. No other project checked out/edited. Shadow cannot write legacy scores; pilot cannot be inferred from design approval. Each stage has independent approvals, test evidence and rollback controls documented in DEPENDENCIES.md.

## I. Risks, unresolved questions and approvals required
Draft SQL may need reviewed hosted guard/role/extension adjustments and transaction/revision consistency enforcement. Immutable trigger protections assume owner access control. Provisional profile allowlist is not a substitute for effective privilege inventory. O/A stay locked, so this is deliberately not a fully enabled five-lane production engine. Trust booleans are accepted server-adapter assertions, not verified client data. Late/complaint mappings, canonical cause overlaps and same-as-of corrections need explicit decisions. Missing native capabilities/deployed gateway/auth identity evidence and external-project contracts block security cutover. No trustworthy causal historical replay is claimed.

Approve review changes first. Separate approvals then required for named isolated implementation/SQL/tests, any read-only live inventory, each production security remediation, coordinated native release, live shadow tables/jobs, V4 display, pilot cohort/stop metrics, wider release and retention policy. Root/source files remain unchanged until approved scope expands.

## J. Confirmation that nothing was executed against production
**No production SQL/query/migration, table mutation, worker-score update, scoring trigger/cron change, dispatch/assignment/notification change, availability/OTP/payment/payout mutation, Edge deployment, app publication, shadow activation or phone release occurred.** Only draft-file preparation, read-only source/report inspection, static SQL checks and synthetic pure local tests were performed. Existing application paths and live authority remain untouched. Stop here and wait for approval.
