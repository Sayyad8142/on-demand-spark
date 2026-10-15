# Worker Priority V4 — Phase 5 draft correction report

**Status: draft-only completed; STOP.** This report addresses the uploaded Phase 5 brief. SOURCE means inspected draft design, EXECUTED means the contained pure test run, and NOT VERIFIED means database/authentication/native behavior that was not exercised. Draft improvements are not deployed fixes.

## A. Exact draft files changed
All paths below are relative to `docs/priority-v4/`; nothing outside that directory was edited.

1. `AGENTS.md` — draft architecture/safety rules updated.
2. `roadmap.md` — Phase 5 scope and completed draft work recorded.
3. `sql/001_registry.sql` — protected target guard; worker, booking, assignment and offer anchors; registry/batch composite keys.
4. `sql/002_canonical_evidence.sql` — assignment ownership/accepted-time FK, same-parent revisions, serialized decision chains, integer rating/XOR contract.
5. `sql/003_opportunities.sql` — immutable offer anchors plus append-only settlement/review revisions and timing validation.
6. `sql/004_calculations.sql` — formula/config/batch/pointer FKs, calculation revision key and fixed neutral component constraints.
7. `sql/005_immutability_projection.sql` — immutable/truncate guards, decision-time checks, integer-fraction total validation, automatic transactional publication and correction ordering.
8. `sql/README.md` — current attestation, ingestion, rating, revision, rounding and adapter obligations; replaced obsolete Phase 3 limitations.
9. `engine/calculate.ts` — Phase 5 candidate identifier, explicit windows, complete correction chains, safe replay/quarantine, strict envelope and trust checks, lifetime provisional state.
10. `engine/projection.ts` — NEW pure projection tuple comparator.
11. `security/PATCH_DRAFTS.md` — explicitly preserve released legacy ACK behavior pending coordinated authenticated transport tests.
12. `security/ANDROID_COORDINATION.md` — old/new wire matrix and preservation requirements.
13. `tests/phase5.test.ts` — NEW expanded pure tests.
14. `tests/run_offline.py` — NEW reviewed-graph runner, scrubbed environment and positively verified kernel transport denial.
15. `tests/TEST_SPECIFICATIONS.md` — executed versus prepared coverage, database/auth/device matrix and current containment evidence.
16. `tests/PHASE_5_TEST_RESULTS.txt` — NEW actual contained-run output plus clearly labeled static checks.
17. `PHASE_5_REPORT.md` — NEW this A–H report.

Existing `tests/engine.test.ts`, `tests/fixtures.ts`, `engine/rational.ts`, `security/contracts.ts`, `DEPENDENCIES.md` and historical Phase 3 report remain unchanged. No application source, Android source, root architecture file or root roadmap was changed.

## B. Resolution of the six design issues

### 1. Opportunity settlement — SOURCE
Immutable opportunities hold canonical identity/start only. `v4_offer_opportunity_revisions` appends raw/normalized status, terminal time, confirmed response, provenance, settlement state, review state, actor/reason/evidence/policy and decision time. Latest eligible revision as of the known-at cutoff determines state; the original row is never updated. Accepted/rejected status requires authoritative confirmation; terminal status/settled revisions require terminal time. Decisions and terminals cannot precede offer start. Corrections and disputes append, not overwrite; disputed/excluded latest decisions must not resurrect superseded blame.

### 2. Revision ownership — SOURCE
Each revision has unique `(parent,revision)` and `(id,parent)`, with composite `(supersedes,parent)` FK. First revision must be 1/no predecessor; subsequent inserts acquire a per-parent transaction advisory lock and require latest+1, exact latest predecessor and nondecreasing decision time. Separate triggers ensure decisions do not predate their immutable event/offer. History rejects UPDATE, DELETE and TRUNCATE. Transaction isolation/concurrency behavior still requires real PostgreSQL tests; callers must retry the entire transaction on conflicting stale snapshots.

The pure engine accepts complete sequential revision chains, deduplicates identical rows, selects the latest decision known by caller-supplied asOf and quarantines gaps/conflicts/moved events/reordered decision times. It never falls back from an unverified latest decision to superseded blame. These synthetic tests validate engine replay, not SQL triggers.

### 3. Projection integrity — SOURCE
Composite calculation FKs enforce formula/config hash and evidence-batch/formula identity. Projection FK includes calculation ID, worker, formula, asOf and revision, so a pointer cannot carry another history row's time/worker/version. Component bounds hold O=12 and A=6. Trigger validates exactly five rational component keys, prescribed numeric component conversion, ingestion cutoff and exact integer-fraction rounded total; display-component rounding cannot decide a half-cent tie.

AFTER INSERT publishes the calculation in the same history transaction; failure rolls back the insert. Publisher locks worker/formula, carries calculation_revision in both INSERT and conflict-update and rejects stale/equal tuples. Direct pointer writes must reference latest history; backward moves and same-position/different-ID replacements are rejected. Source review found and corrected an omitted publisher revision column and missing accepted-time ownership linkage before delivery. SQL was not parsed/applied, so runtime validity is NOT VERIFIED.

**Remaining adapter contract:** lock before snapshot reads, verify source/known-at manifests, reconstruct canonical evidence, compute deterministic hashes, retrieve identical replay row, and update onboarding in the SAME outer transaction. Trigger publication narrows partial-write risk but does not supply this adapter or validate source truth/sample facts. There is no running job consumer.

### 4. Same-time corrections — SOURCE + pure EXECUTED
Ordering is lexicographic `(as_of,calculation_revision)`. First calculation per timestamp is revision 1; subsequent same-time corrections require previous max+1 and a nonempty reviewed correction reference. Newer timestamp wins regardless of older revision number; equal replay/stale corrections cannot replace newer projections. History remains append-only. Pure comparator tests cover first/equal/newer correction/stale correction/older timestamp with higher revision/new timestamp reset/invalid revision. They do NOT validate real locks, races, rollback or permission enforcement.

### 5. Rating validation — SOURCE + pure EXECUTED
Candidate scoring accepts genuine integer ratings 1–5 only, utility `(rating−1)/4`; fractional, missing, string, out-of-range and nonfinite values are rejected/quarantined. SQL uses integer rating plus source XOR: genuine rating requires rating and forbids complaint utility; complaint requires utility and no rating. Complaint decisions are audit-only and excluded from this candidate Q calculator pending policy approval.

PostgreSQL integer input/coercion is not a fractional-payload validator: the trusted server adapter must validate the original number before binding/casting. Testing this API/database boundary remains necessary. Worker-editable/default/synthetic/unverified ratings are never genuine evidence merely because a value is within range.

### 6. Canonical ownership — SOURCE
Separate immutable synthetic worker/booking/assignment/offer anchors avoid legacy or production table dependencies. Assignment triples bind worker+booking+generation; outcome accepted timestamp additionally matches assignment accepted_at. Fault/outcome/quality references cannot name a nonexistent anchored assignment. Offers bind request+worker+booking+generation+round+start to the complete canonical offer anchor. Rejected opportunities are not required to have an accepted assignment.

Before creating anchors, the future trusted adapter must verify authoritative worker identity, booking, assigned worker/generation/accepted timestamp and offer ownership against a reviewed source manifest. Batches carry ownership manifest hashes. Unknown generation, ambiguous identities, cross-owned evidence or unverified source hashes go to review, not scoring. Internal FKs prove consistency only: a privileged writer can fabricate internally consistent anchors, so source verification is still a mandatory unimplemented integration gate. One canonical fault contributes through R outcome only; no second penalty lane.

## C. Updated environment safety controls
**SOURCE: all five transactions fail closed before DDL.** They require an externally provisioned protected `v4_target_attestation.approved_targets` record matching database OID, PostgreSQL cluster system identifier and restricted current runner. A valid explicit 20-letter project identifier must not be production `paywwbuqycovjopryele`; environment must be isolated-synthetic, control-plane verification exactly true, evidence hash valid, approval reference present and sufficiently long, expiry finite and unexpired. Session project/ref must match but cannot establish attestation. Missing/NULL/invalid/ambiguous records fail. Database names and the word development are not safety evidence.

Runtime roles and migration runner must have no effective mutation privileges on the attestation. Independent provisioning must additionally prevent runner ownership, schema CREATE, writable role membership, grant options, DDL/trigger alteration and production credential/network access. The hosting control-plane identity must be verified against the actual SQL connection before the independent owner records approval. No attestation schema or test project was created; no catalog or database query was executed. Supabase support for catalog access and a sufficiently restricted migration principal is NOT VERIFIED; errors must not be bypassed. No SQL guard can stop a superuser controlling both sides or prove authenticity of its own external records.

**EXECUTED offline controls:** seven reviewed pure files copied into a fresh temporary directory; restricted local import graph and capability scanner; no project config, app setup, package dependencies, preload, inherited credential/session variables or service transports. Child environment contains only PATH/HOME/TMPDIR. Linux x86_64 seccomp denies socket transports and io_uring; an independent positive socket-denial probe must succeed before Bun tests. Run printed `NETWORK_DENIAL_VERIFIED` and `REVIEWED_GRAPH=7; ENVIRONMENT_SCRUBBED; NO_APP_CONFIG; NETWORK_DENIED`.

This is reviewed-source containment plus kernel network denial, not a complete filesystem sandbox: normal filesystem permissions remain, and absence of file-access capabilities in the reviewed graph is part of the assurance. Runner/tests read no credential files. A capability-scanner refusal and a missing interpreter path stopped earlier attempts before tests; the name conflict/path were corrected, and the successful final run is recorded. No package installed and no network/service call made by tested code.

## D. Actual pure-test results
**EXECUTED: 125 passed, 0 failed, 432 expect() assertions across 2 test files.** Bun 1.3.3; final contained run reported 248 ms. Historical Phase 3's 24 tests are included, not added again to inflate the total. Result log: `tests/PHASE_5_TEST_RESULTS.txt`. Command from project root: `python3 docs/priority-v4/tests/run_offline.py`.

Coverage includes 30/90/14/7-day inclusive-lower/exclusive-upper predicates; R/Q/J lower-boundary ±1ms calculator checks; separate R success/fault mass caps 20/5; Q cap 50; 5→10 maturity; duplicates and corrected/excluded/replayed incidents; malformed chains, numbers, timestamps, ratings, booleans, rows/envelopes; exact 60.00 zero history; O=12/A=6; aging/recovery; same-time tuple ordering; deterministic recalculation and permutations. R/Q lower-boundary events have zero decay mass although included. 14-day tests validate only the window predicate, NOT an unlocked availability formula. Pure mock identity tests are not cryptographic authentication.

Static checks separately inspected all five guards, each new public table's service grant, publisher revision column, assignment accepted-time FK and rational total call. **These were string/source checks, not SQL parse/apply or integration tests.** Latest available preview build signal was build OK; neither quoted UMD phrase nor an application change was introduced, and no claim is made that the user's historical reported error was fixed.

## E. Remaining SQL/database integration tests
All are **NOT VERIFIED / specification only**, detailed in `tests/TEST_SPECIFICATIONS.md`:
- Approved isolated hosted target/catalog/roles/attestation; every fail-closed case including production, writable/inherited runner authority, NULL/expired/duplicate records and clones.
- Parse/apply 001→005 before data; generated-duration compatibility, grants/schema USAGE, RLS and helper execution per anon/authenticated/service and effective ownership.
- Immutable updates/deletes/truncation denied; same-parent chain, first/latest revision, concurrent branches, event/decision/start constraints and settlement→review→correction replay.
- Canonical source ownership, unknown-generation quarantine, accepted-time FK, formula/config/batch mismatches, pointer identity, derived/untrusted telemetry exclusion.
- Real parallel recalculations and revision appends under supported isolation levels; identical replay row, stale tuple, legitimate correction, lock-before-snapshot, serialization retry and rollback of history/projection/onboarding together.
- Independent rational reference and PostgreSQL conversion/half-cent parity, malformed rational JSON/keys, large fractions; fractional rating payload rejected before SQL integer coercion.
- Persistent lifetime onboarding count and first/fifth/tenth milestone timestamps, approved correction semantics and atomicity.
- Availability overlap/union/IST/OFF/unknown-gap/active-service exclusions; continuous visibility/trust and provenance gates. A/O remain locked until a separately reviewed candidate.
- Real Firebase signatures/audience/issuer/project/expiry/revocation/disabled-account, worker/offer binding, admin identity/grants, safe profile mutation inventory and supported-client compatibility.

## F. Android compatibility requirements
**Current Android and Edge Function files are unchanged.** Existing anon ACK transport, aliases, request-or-booking lookup, success response, seen/popup writes, retries and watchdog cancellation remain released behavior until a coordinated authenticated transport is device-tested and separately approved. Legacy diagnostics are not trusted V4 evidence. No backend-only rejection of old clients or suppression of their existing writes is authorized.

Prepare separate diagnostic-receipt/trusted-evidence result semantics in an isolated versioned adapter. Native uses securely acquired fresh Firebase token or separately reviewed narrowly scoped offer capability where feasible; original account/request/generation ownership survives queued retry. Account switch/log-out must drop/quarantine, not relabel. Retry expiry once then bounded backoff/TTL; permanent mismatch/revocation must not loop indefinitely. No client-held shared signing secret; no capability authorizes Accept/Reject, score/health/payment mutation or proves attention.

Phone matrix covers released/new native wire and web ACK; old anon/no token/expired/revoked token; incorrect owner/generation; delayed retries after another worker accepts; logout; duplicates; offline/airplane/reboot/Doze/killed/background; outage; watchdog/tray and one popup/FIFO≤20. Acceptance clears queue; confirmed busy ownership/manual OFF remain. Telemetry never blocks or changes authoritative Accept/Reject. No new location/overlay/full-screen permission; version/update prompting unchanged. No device or authenticated transport test was run.

## G. Outstanding blockers
1. Independently verified nonproduction project, protected attestation owner, restricted credentials/network and suitable hosted migration principal do not exist in verified evidence. Prior audit found development resolves to production; no new connection/check was attempted here.
2. SQL trigger/FK/grant/correctness, exact parity and transaction adapter/onboarding tests not executed.
3. Trusted source manifests/canonical ingestion and independent arithmetic reference not implemented; sample/milestone authenticity is adapter-dependent.
4. Real authenticated ACK, old/new native compatibility, watchdog/tray and device matrix not tested. Current behavior must remain untouched.
5. External Admin/User App owners and actual admin identity bridge, profile allowlist/grant inventory and dispatch ownership not verified; no cross-project changes.
6. Future O/A trust/formulas and complaint policy unapproved; candidate holds neutral locks. No shadow, dispatch pilot or worker-display rollout is authorized.

These blockers wait on separate approval, external owners, infrastructure and integration/device evidence; they are not background work that will continue after this report.

## H. GO/NO-GO for creating a separate test environment
**Conditional GO to request a separately approved, synthetic-only nonproduction environment; NO-GO to create/connect/migrate now.** Phase 5 draft corrections and expanded pure tests are complete, but they do not approve infrastructure actions or prove hosted readiness. A follow-up approval must name the exact independent test project/owner/credential isolation, protected attestation provisioner, supported runner and database/auth/device test scope/costs. After provisioning and control-plane verification, review the target-specific grant/catalog restrictions before any SQL. Do not use the current development connection as a test target or relax guards to make production pass.

**Explicit confirmation:** No production code, SQL execution, database objects, worker scores, notifications, dispatch, availability, payments, payouts or deployments were changed. No application/Android/Edge Function source was edited. No new project was created or connected. Only draft files inside `docs/priority-v4/` changed and contained pure synthetic tests ran. **STOP after Phase 5; no migrations, authenticated/device testing or production implementation without separate approval.**