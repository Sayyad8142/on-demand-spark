# Prompt 98 — read-only deployment prerequisite check

## Decision checklist
| Check | Result |
| --- | --- |
| Existing endpoint | UNKNOWN — public route returns 404; authenticated management listing failed |
| Backup | BLOCKED — no exact deployed version/source/configuration available |
| Managed credentials | UNKNOWN — platform defaults documented, project runtime presence not verified |
| Deployment access | BLOCKED — deployment tool exists, but project function-management access cannot be validated read-only |
| Safe to deploy | NO-GO |

No deployment was attempted. NEXT_BOOKING_LIVE_ENABLED remains false. Nothing under supabase/functions or supabase/config.toml was changed. No database records, dispatch, bookings, availability, notifications, app publication or APK publication were changed.

## Current evidence (12 November 2026)
- VERIFIED: connected backend metadata identifies production project paywwbuqycovjopryele, external/user-managed.
- VERIFIED: Supabase CLI is installed, but `supabase functions list --project-ref paywwbuqycovjopryele` refuses with “Access token not provided.” No login, token creation or secret replacement was attempted.
- VERIFIED: available gateway Supabase CLI commands expose info, logs, analytics, queries and linting, not function inventory or source download. Available Supabase tools include deployment, but no authenticated function list/download or read-only deployment permission check. Tool availability alone does not prove permission to deploy to this project; do not use a write attempt as a permission probe.
- VERIFIED: names-only secret inventory lists 11 custom/managed app secrets, but does not list SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. Their absence from this inventory does not prove absence in the Edge runtime. Locally SUPABASE_URL is set; the two legacy keys and SUPABASE_ACCESS_TOKEN are absent. Local presence does not establish hosted presence.
- SOURCE: [Supabase environment-variable documentation](https://supabase.com/docs/guides/functions/secrets) describes injected defaults, including SUPABASE_URL and legacy SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY. This resolves the general platform-contract question, not the target project's runtime state. No secret values or derived values were recorded.
- VERIFIED: public OPTIONS and POST (missing/invalid caller token) each return 404 NOT_FOUND. These are platform route responses, not endpoint security tests, and cannot exclude a saved/inactive function configuration. Endpoint existence remains UNKNOWN, not NO.
- VERIFIED: staged Deno entrypoint and test file compilation pass on Deno 2.8.3 with isolated imports; 29 isolated adapter/security tests pass. No production data is used by these tests. Current 34 frontend contract/lifecycle tests also pass.
- VERIFIED: hosted preview build br_6d36042e-08d7-43cd-8361-727bb21e76d7 succeeded, is in sync, and reports no compiler diagnostics or failed targets. The reported use-mobile.tsx TS2686 error is NOT REPRODUCED: the hook uses named React imports and contains no quoted instruction-like identifier. No speculative hook edit was made.

## Authentication and package compatibility
SOURCE + isolated tests: npm: Supabase/Zod imports, Deno.serve entrypoint, local imports entirely inside the staged package, SDK CORS on every response, server-verified Supabase Auth getUser session before service-role reads, strict scope validation, conservative failures. No phone linking or caller-supplied identity.

PROPOSED deployment configuration: verify_jwt=false with mandatory in-code session verification. This is compatible with Supabase signing-key authentication and does not make ranking data public. The current config has no worker-availability-ranking entry. No hosted authentication setting can be confirmed until management inventory is available. A future approved deployment must explicitly confirm the effective setting rather than assume the local omission guarantees it.

Package has index.ts, handler.ts, core.ts and handler_test.ts; no staged deno.lock or import-map dependency currently exists. Local compilation proves package consistency, not hosted deployment success.

## Remaining gates
1. Read authenticated management inventory for this exact project. If present: identify exact version, effective auth configuration and download a verified backup before replacement. If absent: record authoritative absence, then mark backup NOT REQUIRED.
2. Obtain a values-hidden, authoritative runtime-presence check for all three required variables. Platform documentation and custom-secret inventory alone cannot satisfy the requested project-specific check. Do not deploy a diagnostic endpoint or expose secret values to obtain it.
3. Confirm project-scoped deployment permission through management access without a production write.
4. Reconfirm endpoint-only deployment scope after these gates pass. Prompt 98 explicitly withholds deployment until then, superseding immediate execution of Prompt 97 approval.
5. After separately approved deployment, verify hosted CORS/auth, privacy and authenticated worker isolation before any separate UI activation request. External unmanaged auth prevents authenticated worker checks here; do not create or impersonate a worker to bypass that limitation.

No exact existing version, verified backup, hosted credential check or deployment-access PASS is claimed. NO-GO remains until these external access/evidence blockers are supplied.