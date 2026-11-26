# Worker onboarding + Cashfree IMPS — Admin backend dependencies (LIVE READ 2026-11-26)

The available Worker App changes are implemented. Missing Admin-owned contracts remain blocked rather than using unsafe client workarounds. No backend, provider, payout record, release version or publication was changed.

| Needed by the app | Live status | Blocks |
|---|---|---|
| Worker RPC/edge fn to submit bank details (holder, account, IFSC) that validates server-side, stores them outside worker-readable tables, and creates the Cashfree beneficiary | **MISSING.** Only `create-worker-payout-account` (reads bank fields the app writes straight into `workers`) and admin-only `admin_*_bank` RPCs exist | Mandatory bank step, correction flow, "beneficiary ready" check |
| Worker-readable bank status (e.g. `get_my_bank_status`: none / validating / ready / invalid + reason, masked account, bank name) | **MISSING** | Profile/payout "where money goes", "needs correction" |
| Admin "Collect Worker UPI ID" setting readable by workers | **EXISTS.** Authenticated `get_worker_payout_onboarding_config()` returns `bank_required=true`, `collect_worker_upi=false`; connected in signup, bank details and Profile | Signed-out registration cannot read this authenticated-only setting; defaults OFF safely |
| Successful instant IMPS count | **PARTIAL.** `get_my_payout_summary.instant_slots` returns `settled` (paid) but `remaining = 10 − allocated` and `payout_mode` switches on allocated, not successful | "3 of 10 completed / 7 remaining" and the switch to daily after 10 successful |
| Daily settlement data | **EXISTS** (`next_settlement`, `totals_inr`, `today`) but daily prep cron fails every run with `ERROR: forbidden` | Daily payout card would show amounts that never get paid |
| Payout history with type, UTR, booking breakdown | **EXISTS; CONNECTED** through session-scoped `get_my_payout_history/detail`, paginated with refresh and error states | Authenticated readback not verified; legacy booking earnings remain separate |
| Bookings blocked until bank ready + approved | Owner requires both. App preserves readiness/approval gates. Live `set_worker_payout_ready` still accepts UPI alone or syntactically valid bank fields; `require_bank_beneficiary_for_dispatch=false` | Admin must enforce verified bank + beneficiary in readiness, dispatch and acceptance; owner instruction is not deployment proof |
| Deleted account → fresh signup | App removed `ensure_worker_profile` fallback and signs out after two successful missing own-worker reads; network errors do not log out | Secure fresh registration with an existing Auth phone remains unavailable; Admin must remove server phone relinking |

## Completed Worker App changes
- Mandatory holder/account/confirmation/IFSC fields; bank numbers excluded from saved signup drafts and OTP state. Signup submission and bank correction fail closed while the approved secure writer is absent. This means fresh signup cannot currently complete.
- No client bank writes, Cashfree beneficiary creation, `payout_ready` setting or phone/worker-identity edits. Profile phone is read-only; UPI optional and hidden unless Admin explicitly enables it.
- Deleted own-worker checks on open/foreground/reconnect; logout clears account browser/native storage, query cache and existing alarm/practice/diagnostic state while preserving language.
- Server payout history/detail connected; legacy/manual labels and Paid timestamp safety retained. Instant progress displays successful server counts, not allocated slots; remaining count and upcoming amount are copied from the server. Allocation-based summary stays OFF.
- English/Hindi/Telugu bank and payout messages; existing Admin approval and unrelated booking/OTP protections preserved.

## Admin connection requirements
1. Supply an approved registration/bank writer deriving identity from a verified session, accepting bank details in-memory, validating and creating Cashfree beneficiaries internally, and returning confirmed worker/status data. Never accept a phone-supplied worker identity or return full bank numbers.
2. Supply masked session-scoped bank status and correction reasons; certify bank-only readiness and beneficiary enforcement across dispatch and Accept.
3. Correct summary mode/remaining counts to successful IMPS transactions, including the approved fresh ten for every worker. Preserve already-paid records and existing held daily jobs at 7 PM.
4. Repair scheduler authorization and verify real settlement execution before activating daily cards/providers. Read-only recheck found 45 failed daily-preparation runs with `ERROR: forbidden`; Cashfree IMPS/RazorpayX remain OFF.
5. Provide a safe pre-registration UPI configuration contract if Admin-enabled collection must appear before login; current authenticated-only configuration intentionally fails closed.

## Verification and production readiness
- **PRIOR, THIS REQUEST:** full frontend regression suite: 98 files, 1,024 tests passed; preview reported build OK at 08:43:55 UTC. Signed-out real signup at 393×805 and 1280×1800 checked bank validation, UPI OFF, en/hi/te, no horizontal overflow, no bank draft persistence and disabled unsafe OTP submission; no page errors.
- **CURRENT RECHECK:** 40 focused mobile-hook/bank/payout tests passed. Hook explicitly imports React hooks; quoted UMD diagnostic was not reproduced. Current observability log was unavailable after the workspace refresh; do not treat that absence as a fresh build proof.
- **NOT VERIFIED:** authenticated registration, deleted-worker logout and payout history readback (external unmanaged auth does not supply a worker session); secure Cashfree beneficiary creation; real IMPS/scheduler execution; installed Android notifications/OTP/upgrade.
- **RELEASE BLOCKED:** release safeguard refused unknown highest uploaded Play version code; Android bundle verifier refused missing current `dist/index.html`. Current source remains 10.0.05 (105), not a certified next release. Production web build/sync, JDK/SDK/signing and physical-phone checks are still required. No signed AAB or publication.

## Repeated mobile-hook error: current cross-app check
Rule: phone-size detection must work without an externally supplied React browser global.
- **SOURCE CHECKED:** `src/hooks/use-mobile.tsx` imports `useEffect` and `useState`; no quoted prompt text exists in `src`. It follows the rule.
- **SOURCE CHECKED:** its only application caller, `src/components/ui/sidebar.tsx`, imports React explicitly and imports the hook. No screen currently imports that sidebar. It follows the rule; no speculative code change required.
- **SOURCE CHECKED:** `tsconfig.app.json` uses `react-jsx` and forced modules; the hook's breakpoint/listener test imports the hook and exercises 393/768/767px with listener cleanup. Test passed.
- **RAN:** current `/home` at 393×805 redirects signed-out users to `/auth`; Sign In visible, no Vite error overlay and zero page errors. Screenshot inspected. This is not an authenticated Home verification.
- Background jobs and database functions have no call path to this browser hook; none were modified. The supplied TS2686 diagnostic remains **NOT REPRODUCED**, not a claimed repaired source defect.

## Must not happen
No Cashfree calls or keys in the app; no bank numbers written to `workers` by the app; no locally computed counts; no real payouts; no auto-publish.
