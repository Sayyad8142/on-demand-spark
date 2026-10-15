# Implementation/deployment dependency map
| Order | Stage / predecessor | Project boundary | Gate and rollback |
|---|---|---|---|
| 0 | Approve drafts; verify isolated target, actor model, grants/payload inventory and remaining policies | This Worker project plus shared backend owner | No production target; no execution now |
| 1 | Backend verified identity/score mutation contracts + versioned diagnostic quarantine designed, tested in isolation | Shared Supabase backend; Worker project hosts candidate Edge sources | External Admin and User App payload/identity owners must review; no backend-only ACK cutover |
| 2 | Native authenticated ACK/web token adapter paired with stage 1 compatibility | This Worker App Android + JS; external backend deployment coordination | Phone matrix/release approval; preserve queue/manual OFF, aliases/watchdog; no forced update |
| 3 | Isolated V4 registry/canonical evidence/engine/transaction adapter | Separate approved test database; drafts portable from this project | SQL permissions/concurrency/parity tests; no production consumers |
| 4 | Admin inspection, append-only adjudication/correction, safe summary | **Another Lovable Admin Panel project required**; not checked out or modified | Establish actual separate-role admin authority; independent read/correct permission; audited revisions |
| 5 | Approved prospective non-authoritative shadow | Shared backend + external Admin Panel comparison | Own live tables/jobs/telemetry approval; independent V2/V4 ordering; never writes workers.priority_score |
| 6 | Controlled dispatch pilot after shadow evidence/owner approval | **Dispatch/customer-booking owning project must be identified**; may be another Lovable User App/backend project | Explicit cohort/stop metrics/atomic acceptance; disable pilot independently, retain security/audit |
| 7 | Optional worker display and wider release, not in this phase | Worker App + Admin + User App shared-contract signoff | Explicit V4 version and missing-state policy; device/store prerequisites; keep update prompting disabled |

Backend stage 1 is preparation first, not a demand to tighten current production ACK before native stage 2. Actual live backend/native cutover follows dual-version/quarantine device approval. Security rollback never reinstates decode-only auth or broad unsafe score grants. No project IDs for external Admin/User App or isolated hosted target are verified. No cross-project changes, dispatch calls, cron, migration, deployment or release are performed here.
