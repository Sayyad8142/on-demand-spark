# Worker onboarding + Cashfree IMPS — Admin backend dependencies (LIVE READ 2026-11-26)

The request says: if an Admin endpoint is missing, report it instead of building a workaround. These are missing, so the matching Worker App parts are on hold.

| Needed by the app | Live status | Blocks |
|---|---|---|
| Worker RPC/edge fn to submit bank details (holder, account, IFSC) that validates server-side, stores them outside worker-readable tables, and creates the Cashfree beneficiary | **MISSING.** Only `create-worker-payout-account` (reads bank fields the app writes straight into `workers`) and admin-only `admin_*_bank` RPCs exist | Mandatory bank step, correction flow, "beneficiary ready" check |
| Worker-readable bank status (e.g. `get_my_bank_status`: none / validating / ready / invalid + reason, masked account, bank name) | **MISSING** | Profile/payout "where money goes", "needs correction" |
| Admin "Collect Worker UPI ID" setting readable by workers | **MISSING.** Only `app_config.enable_bank_payout_details` exists | Hiding/restoring UPI entry |
| Successful instant IMPS count | **PARTIAL.** `get_my_payout_summary.instant_slots` returns `settled` (paid) but `remaining = 10 − allocated` and `payout_mode` switches on allocated, not successful | "3 of 10 completed / 7 remaining" and the switch to daily after 10 successful |
| Daily settlement data | **EXISTS** (`next_settlement`, `totals_inr`, `today`) but daily prep cron fails every run with `ERROR: forbidden` | Daily payout card would show amounts that never get paid |
| Payout history with type, UTR, booking breakdown | **EXISTS** (`get_my_payout_history/detail/breakdown`) | — (ready to wire) |
| Bookings blocked until bank ready + approved | Server `accept_booking_authoritative` checks `payout_ready`; `send-fcm`, `notify-next-tier`, `get-pending-worker-bookings` also filter it | Needs owner confirmation (conflicts with earlier owner rule) |
| Deleted account → fresh signup | `ensure_worker_profile` returns `WORKER_NOT_FOUND` (does not auto-create) — OK. But it re-links any row matching the phone number; after deletion that's safe, before deletion it hands an old row to a new login | Admin should drop phone re-linking |

## Worker App parts that can be built once the above exist
Mandatory bank step in signup (reuses existing 4 fields), UPI hide/restore by setting, instant-count + daily cards via existing `HybridPayoutSection`, history labels, stale-session cleanup on `WORKER_NOT_FOUND`.

## Must not happen
No Cashfree calls or keys in the app; no bank numbers written to `workers` by the app; no locally computed counts; no real payouts; no auto-publish.
