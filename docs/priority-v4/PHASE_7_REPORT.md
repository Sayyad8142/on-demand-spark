# DIDI NOW — Worker Priority V4: Phase 7

**Draft-only correction complete. STOP. SQL/PostgreSQL/hosted validation NOT performed.**

The uploaded Phase 7 brief controls scope: only `docs/priority-v4/` was changed. The reported application errors are not reproduced: the hook explicitly imports React, the quoted phrase is absent from searched application source, and `src/routes/__root.tsx` is absent. Latest available preview log reports **build OK** (2026-10-16 05:50:26 UTC). No application repair is claimed or authorized by the attached brief.

## A. Exact draft files changed

1. `sql/002_canonical_evidence.sql` — quality observation FK corrected to assignment primary-key triple.
2. `sql/README.md` — clarified quality identity, attestation/executor distinction and partial-install rollback.
3. `sql/PROVISIONING.md` — NEW proposed three-authority lifecycle, owner handoff and unresolved hosted gates.
4. `security/contracts.ts` — pure synthetic quality-assignment tuple comparator; not an ingestion implementation.
5. `tests/phase5.test.ts` — ten additional synthetic ownership regression cases.
6. `tests/static_consistency.py` — NEW narrow local source-shape checker with missing-column rejection control.
7. `tests/TEST_SPECIFICATIONS.md` — actual Phase 7 results, checker limitations and future isolated tests.
8. `tests/PHASE_7_TEST_RESULTS.txt` — NEW actual offline run and separate source-check output.
9. `AGENTS.md` — quality triple and separated DDL/runtime architecture rules.
10. `roadmap.md` — Phase 7 checklist and remaining execution blocker.
11. `PHASE_7_REPORT.md` — NEW this A–G report.

Paths above are relative to `docs/priority-v4/`. SQL drafts 001/003/004/005, the containment runner, engine, existing historical reports/results, application, Android, Edge Functions, root files and Supabase configuration remain unchanged. No Files copy or source ZIP was requested or created.

## B. Missing-column defect resolution — SOURCE + narrow regression checks

Quality observations now reference `v4_assignments(worker_id,booking_id,generation)`, its existing PRIMARY KEY. All three local fields exist, are NOT NULL and generation is constrained nonnegative. The observation's UNIQUE triple still permits only one canonical observation per assignment; revisions append under its observation ID.

This matches the evidence model: quality stores the quality event time, not a copied acceptance time. No acceptance timestamp is invented or made newly mandatory. Outcomes retain their declared accepted_at and stronger four-field acceptance-time FK; fault incidents already use the same triple as quality. Worker, booking and assignment generation must all match one canonical parent; changing any element cannot reference the original assignment. Authenticity still depends on verified source manifests and trusted rating-to-assignment ingestion, not just internally consistent synthetic anchors.

The static checker confirms local FK columns and a unique parent tuple. Its positive control reintroduces the former missing accepted_at reference **in memory only** and refuses it. Actual PostgreSQL enforcement and trusted-source attribution remain NOT VERIFIED.

## C. Provisioning and role design — PROPOSED, hosted feasibility unresolved

The conceptual conflict is resolved by distinguishing temporary installation authority from steady-state runtime authority:

- **Independent attestation provisioner:** owns protected attestation, verifies actual hosting project/connection/cluster/database, issues expiring approval, and never grants executor/runtime writable or owner access.
- **Temporary migration executor:** necessarily has CREATE and ownership on V4 objects during installation; it is NOT an unprivileged fixture writer. It must be independently restricted from attestation ownership/mutation/escalation and production credentials/network. Exact current_user after any SET ROLE must match attestation.
- **Steady-state V4 object owner:** supported NOLOGIN role controlled independently. Future isolated installation requires audited V4-only ownership handoff and disabling/revoking executor access before writers connect.
- **Runtime/fixture writer:** existing draft service_role DML/helper grants only; no CREATE/ALTER/TRUNCATE, owner/executor membership, grant options or trigger-disable authority. Effective inherited/PUBLIC/default privileges must be audited, not inferred from these statements.

The executor cannot be treated as hostile while owning the V4 objects; independent review, bounded credentials and a closed ingestion window are essential. All five guards remain unchanged. No role/owner provisioning SQL or credential changes were performed.

**Hosted gates remain unresolved:** restricted migration-principal selection, role creation/NOLOGIN, safe owner transfer/SET ROLE, effective schema/default privileges, cluster catalog access and protection from provider/admin authority. A managed principal that can alter the attestation is unsuitable. Unsupported controls cause STOP, never guard weakening or modification of reserved schemas/managed roles.

service_role deliberately bypasses RLS. BYPASSRLS does not itself confer missing table privileges or bypass immutability triggers; it does mean policies cannot authenticate a service writer. Privileged ownership/superuser and role-escalation paths must be checked independently. The proposed separation is not established by documentation or by the guards' DML checks.

## D. Final static SQL consistency findings

**Method:** full manual source review of 001→005 plus independent read-only source audit, supplemented by a narrowly scoped local text checker. No SQL parser, database connection, SQL execution, schema tool, linter or PostgreSQL validation was used.

| Area | SOURCE finding / remaining limit |
|---|---|
| Columns/FKs/unique targets | Corrected quality triple resolves the known missing-column defect. Narrow checker covers all 21 tables and 40 FK clauses; referenced tuples have declared PK/UNIQUE backing. No other missing FK/key column was found. Not a type/operator/catalog proof. |
| Required INSERT columns | Single explicit publisher INSERT supplies worker_id/formula_id/calculation_id/as_of/calculation_revision; stale has a default. Upsert carries revision and resets stale. |
| Trigger/function dependencies | Tables precede their triggers; 002 defines chain helper used by 003; 005 defines decision/calculation/projection/publisher helpers after their tables and before attaching triggers. Dynamic truncate trigger targets exist. Runtime privileges and PL/pgSQL resolution remain untested. |
| Revision chains | Same-parent composite predecessor FKs, revision 1/no predecessor, latest+1/exact predecessor/nondecreasing decision time, event/start checks and append-only guards are present. Real locks, stale snapshots and serialization retry remain untested. |
| Calculation/projection | Formula/config and batch/formula FKs plus complete pointer tuple FK are present. Exact rational total accumulation and ordered same-time corrections are source mechanisms, not independently verified arithmetic/database parity. |
| Immutable settlement | Immutable opportunity anchors and separate append-only settlement/review revisions remain; confirmed responses and terminal/start/decision timing checks are present. Source authenticity and latest-known-at adapter selection remain unimplemented. |
| Migration order | Five separate guarded transactions. Partial installation remains a concrete risk until 005 installs final protections. New lifecycle forbids all ingestion/consumers before full installation and owner/privilege verification; SQL alone does not enforce this operational admission gate. |
| Grants/roles | Immediate table grants, client revokes and RLS statements present. Helpers revoke client/PUBLIC execution and grant service execution. Effective role inheritance/default grants, owner bypass and schema authority remain unresolved hosted checks. |
| Attestation | Same fail-closed guards unchanged; missing/invalid/expired/writable/mismatched approvals or production reference refuse. External attestation authenticity and restricted principal/catalog support are NOT VERIFIED. |

**Non-activated limitations retained, not expanded in this correction:**

- O=12 and A=6 are intentionally locked for this candidate; unlocking or changing formulas requires separate review, not configuration assumptions.
- Availability deduplication does not prevent overlapping intervals; trusted overlap/union accounting remains an adapter gate and A is locked.
- Calculation job state lacks lease/error cross-field consistency constraints; no job consumer is running. A future consumer needs validation and lease/retry tests.
- Trusted ownership/watermark ingestion, persistent onboarding milestones, deterministic replay retrieval and onboarding atomicity in the outer transaction remain unimplemented.
- Integer rating columns do not validate original fractional API payloads; adapter validation before coercion is mandatory.
- Generated duration expressions, catalog access, exact numeric conversions, schema privileges and concurrent rollback need real PostgreSQL tests after separate approval.

No further concrete missing-column/FK-target/required-publisher-column defect was found in the scoped source checks. This is not a claim that the bundle will execute or that every PostgreSQL semantic/security issue has been exhausted.

## E. Offline tests executed

**EXECUTED:** `python3 docs/priority-v4/tests/run_offline.py`

- **135 passed, 0 failed, 451 assertions across two files**, Bun 1.3.3; recorded run 234 ms.
- Previous 125 cases retained plus ten synthetic quality assignment cases (19 additional assertions).
- The unchanged runner positively printed `NETWORK_DENIAL_VERIFIED`, then `REVIEWED_GRAPH=7; ENVIRONMENT_SCRUBBED; NO_APP_CONFIG; NETWORK_DENIED`.
- Only reviewed pure modules copied to a fresh temporary graph; minimal PATH/HOME/TMPDIR environment, kernel socket/io_uring denial, no app imports/config/preloads, services, credentials, installs or production data.
- This is not a full filesystem sandbox; reviewed graph lacks file/transport capabilities, as documented in the existing runner specifications.

**EXECUTED separately:** `python3 docs/priority-v4/tests/static_consistency.py`

- `SOURCE_SHAPE_OK tables=21 foreign_keys=40 explicit_inserts=1`.
- `MISSING_COLUMN_REGRESSION_REJECTED; NO_SQL_PARSE_OR_EXECUTION`.
- First attempt refused the checker's incorrect expected inventory of 22; inspected count corrected to 21 and rerun passed. No SQL draft was changed to make that mistaken count pass.
- Reads only five local draft text files; no credentials, databases or transport imports. Its coverage is current source shape, not SQL grammar/types, generated-column semantics, function execution, effective permissions or integration tests.

Actual output is preserved in `tests/PHASE_7_TEST_RESULTS.txt`. Historical Phase 5 output is unchanged. No database, authentication, device or application-flow test was run or claimed.

## F. Remaining blockers

1. Independently verified separate synthetic-only Supabase project/connection absent from verified evidence. Prior Phase 6 metadata reported both labels resolve to production; no metadata/database connection was attempted in Phase 7.
2. Hosted restricted executor, protected attestation provisioner, NOLOGIN owner handoff and effective runtime privileges not provisioned or verified.
3. Actual SQL application, FK/trigger/grant/schema/catalog/generated-expression correctness, numeric parity, concurrent correction/replay and rollback not tested.
4. Canonical source manifests/trusted ingestion, transaction adapter and persistent onboarding atomicity not implemented.
5. Real Firebase identity/ACK and old/new native compatibility, device/watchdog/queue tests, external Admin/User App ownership and policy signoff remain pending separate approval.
6. O/A activation, complaint policy, live shadow/dispatch/display rollout remain unapproved.

These wait on infrastructure, external owners and separately approved integration scope. Nothing continues after this report.

## G. Readiness for a separate test environment

**Conditional GO to request a separately approved synthetic-only environment and role-feasibility review. NO-GO to connect, execute SQL or test the database now.** The missing-column draft defect is corrected and narrow checks pass; this removes one source blocker, not the environment/hosted/integration gates.

Next approval must name exact nonproduction project/owner, region/budget, independent attestation provisioner, supported restricted executor/ownership handoff, credential/network isolation, frozen bundle, synthetic test scope, stop conditions and target-only partial-install recovery. Verify identity and supported role/catalog controls before any approved DDL; never use production or relax guards to accommodate it.

**Production remains untouched:** no application/native/Edge Function/root/config changes; no database connections, reads, SQL execution, migrations, roles, worker scores, notifications, dispatch, availability, payments, payouts or deployments. Only draft files changed and local synthetic/text checks ran. **STOP after Phase 7.**