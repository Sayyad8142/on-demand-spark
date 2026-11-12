# Prompt 89 — deployment preparation (12 November 2026)

## Decision
**PARTIAL PASS.** The reviewed practice journal is applied and only the isolated sender is deployed. Real delivery remains OFF. **BLOCKED**: Firebase transport validation and authenticated pilot checks need the owner to name the worker login and phone. No account or device was chosen on the owner's behalf. No APK was released or app published.

## Reported hook error — PASS / NOT REPRODUCED
`src/hooks/use-mobile.tsx` already imports `useEffect` and `useState` explicitly and does not refer to a React UMD global. Hosted preview run `br_514f32cb-10f8-4454-a30f-6a7e5b68ca82` succeeded and has no compiler diagnostics. The hook was not changed unnecessarily. Later hosted run `br_68ef429d-e710-4b26-b751-c09a62258ece` also succeeded.

## Preparation evidence
| Check | Result | Evidence |
|---|---|---|
| Durable backup and rollback | PASS | Project-persisted 73-file source archive with per-file hash verification; `backups/prompt-89/manifest.json`, archive and `ROLLBACK.md`. No credentials or generated builds included. |
| Existing sender baseline | PASS | Endpoint returned HTTP 404 NOT_FOUND before deployment; no previous sender to restore. Practice table/functions were absent. |
| Reviewed SQL applied | PASS | Migration tool completed original reviewed SQL unchanged. Table RLS is enabled; anon/authenticated have no table read/write grants. Only service_role can claim and record. Admin report checks server roles. |
| Isolated deployment | PASS | Only `send-practice-notification` deployed; four source files match staged files byte-for-byte. Submitted source/settings SHA-256 `33da4f752258db399668bf546a9b5bf7e5858f7303eaaba00c79e9cd8b31d0ed`. Gateway JWT setting is false; identity is verified in code. |
| Hosted OFF refusal | PASS | Missing/fake login both received HTTP 503 with `sent:false`, `approval_required`. |
| Browser preflight | PASS | HTTP 200 with origin/header allowance. The function-testing tool cannot issue OPTIONS, so this was checked directly. |
| Validate-mode login checks | PASS | Temporarily configured `PRACTICE_PUSH_SENDER=validate`; missing/fake login returned HTTP 401 `login_required`, `sent:false`. No Firebase request was reached. Restored explicit `off`. |
| Firebase validate_only transport | BLOCKED / NOT VERIFIED | Existing Firebase credential exists by name. No approved pilot account/device supplied, and no usable approved session exists for this externally managed project. Do not bypass pilot checks or target an arbitrary phone to obtain evidence. |
| Real authenticated pilot / wrong-account checks | LIVE NOT VERIFIED | Offline tests prove refusals for empty/wrong pilot settings and wrong device. Live valid-login checks await the named pilot and its session. |
| Anonymous database access | PASS | Journal read and admin report return permission denied; correctly shaped claim call returns HTTP 401 permission denied. Catalog confirms workers also lack claim/record EXECUTE. |
| Regression checks | PASS | 534/534 app tests; 6/6 Deno sender tests through Supabase test tool and local runner; 38/38 Android tests; Android Kotlin/Java compilation BUILD SUCCESSFUL; `deno check` passes. |
| Real-service isolation | PASS for definition/source isolation; workflows NOT VERIFIED | Non-practice public-function hash before/after is identical: `4421621009c4da377145db36bda1939b`. Migration has no production-table edits or triggers; sender reads real work only and writes its own journal. No production business workflows were executed. |

## Security review
- The table's **RLS enabled without policy** flag is intentional default-deny: normal users have neither grants nor policies; service_role owns the approved write path.
- The **authenticated SECURITY DEFINER** flag on the admin report is intentional: it checks `has_role(auth.uid(), 'admin')`, returns a bounded report, and shortens the token fingerprint to eight characters. Granting workers direct table access or removing admin access to silence these generic flags would break the reviewed access model.
- The project has 184 other pre-existing linter findings; this preparation did not change those older policies/functions. This is not a clean-project security certification.
- Quota is serialized per user: three claims per rolling hour, duplicate refusal, one outstanding attempt, forward-only outcome updates. Retention is **lazy cleanup on a new claim**, not a continuously running 30-day deletion job. Existing rehearsal tests cover concrete rules; no synthetic quota rows were inserted in production.
- Supabase service-role binding was missing and repaired through the official rebind tool, not a browser credential or custom secret. Elevated access stays inside the function.
- Server pilot secrets remain absent and therefore refuse every account even in validation mode. App `PRACTICE_PUSH_ENABLED=false` remains unchanged. Server was never configured `on`.

## Remaining approvals and tests
1. Owner supplies the approved worker login and identifies the intended phone; obtain the phone's verified token fingerprint without logging its token.
2. Configure only that pilot and run the already-approved Firebase validate_only check with its authenticated request; restore OFF afterward. This is still an unfinished preparation task, not a completed Firebase check.
3. Separate approval is required for a test-only APK and actual single-phone delivery. Device sound, vibration, foreground/locked/background alert, token-change/logout/preemption and FCM-to-practice-OTP journey remain NOT VERIFIED.

Evidence is preserved in `evidence/prompt-89/`. Generated Android output was removed after saving test XML/compile logs; no oversized repository files remain. No real notification was submitted to Firebase; practice journal remains empty.