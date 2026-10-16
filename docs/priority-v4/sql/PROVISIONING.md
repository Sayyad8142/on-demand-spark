# Proposed isolated provisioning lifecycle — NOT EXECUTED

This is a role design, not role-creation SQL or evidence that hosted Supabase supports it. The five guards remain unchanged. Production is never an eligible target.

## Principals and boundaries

| Principal | Temporary / permanent authority | Forbidden authority |
|---|---|---|
| Independent attestation provisioner | Owns protected attestation schema/table; verifies hosting identity, exact cluster/database and approval expiry | Must not share credentials or grant writable/owner membership to executor/runtime |
| V4 object owner | NOLOGIN steady-state owner of V4 tables/functions, controlled by independent operator | No attestation mutation; no runtime membership enabling SET ROLE to owner |
| Migration executor | Short-lived isolated SQL principal; CREATE in public and object ownership during installation; reviewed bundle only | No attestation CREATE/ownership/DML/grant options/owner membership; no production credentials/network; not a superuser |
| Runtime/fixture writer | Current drafts grant service_role selected table DML and helper EXECUTE; never object ownership or schema authority | No CREATE, ALTER, TRUNCATE, disable-trigger authority, owner/executor membership, grant options, attestation writes |
| anon/authenticated | No draft table/helper access | No direct scoring/evidence mutations |

The executor is intentionally privileged for V4 DDL and cannot be treated as a hostile runtime sandbox while it owns those objects. Independent review, credential isolation and closed ingestion are required during this short window. It must still be unable to tamper with the attestation. The SQL guard checks effective DML, not every ownership/role-escalation path; independent checks must cover those paths before execution.

## Sequence for a future approved environment

1. Independently verify a new synthetic-only project/connection. Deny production transport/credentials; no copied data, live FCM/Cashfree, cron or consumers.
2. Provision protected attestation outside the executor's control. Give executor only schema USAGE/table SELECT plus supported read access needed by the guard. Bind the exact `current_user` (after any SET ROLE), database OID, cluster ID, verified project and expiring approval. It cannot approve itself.
3. Authorize an audited restricted executor for a bounded installation. CREATE in public is temporary and explicit, not something the runtime inherits. Do not run the bundle with a principal able to own/modify the attestation or bypass the guard.
4. Apply 001→005 only in a separately approved phase. Prevent all writer connections throughout; 005 supplies final immutability/publication triggers. Each transaction stands alone; a partial install is not ready.
5. Independent operator transfers **only V4 objects** to a supported NOLOGIN owner and revokes temporary executor CREATE, login/session and owner memberships. No broad REASSIGN OWNED touching other schemas. Ownership transfer privileges and effective default grants must be verified; transfer/grant SQL is not supplied here.
6. Audit effective privileges and inherited/PUBLIC grants on every V4 object and schema. Existing Supabase defaults may grant more than these explicit statements; REVOKE on named client roles alone cannot prove effective isolation. Verify owner separation, helper execution, RLS bypass boundaries and trigger tampering denial before admitting a writer. Revoke attestation approval after installation. Archive exact bundle/evidence and target-only recovery plan.
7. Admit only reviewed synthetic ingestion. service_role bypasses RLS and authenticates source only via an unimplemented trusted adapter; it is not a cryptographic evidence guarantee. Future narrower writer roles require their own reviewed grants/policies, not an assumed rename of service_role.

## Hosted Supabase gates — UNRESOLVED

- The platform-managed migration principal may be effectively owner/superuser or lack a restricted-role selector. If it can tamper with attestation, **do not use it**. Separate executor selection is not verified here.
- CREATE ROLE/NOLOGIN, SET ROLE/ownership transfers, revocation of PUBLIC/schema CREATE and managing existing role inheritance may be unavailable to the customer. Do not alter Supabase-reserved schemas or managed roles to force this design to work.
- `pg_control_system()` access, actual hosted cluster identity semantics (including clones), database OID and attestation schema privileges require isolated verification. An access failure is a STOP, not permission to remove the guard.
- Effective service_role grants/ownership/default privileges and provider maintenance authority must be reviewed. If runtime cannot be separated from DDL authority, fixture testing remains NO-GO.
- A privileged host administrator can bypass local SQL controls. External administrative trust and credential/network isolation remain unavoidable assumptions, not proven by an SQL condition.

No infrastructure, roles, credentials or attestation were provisioned in Phase 7. This resolves the conceptual ownership conflict by distinguishing installation authority from runtime authority; hosted feasibility remains a blocker.