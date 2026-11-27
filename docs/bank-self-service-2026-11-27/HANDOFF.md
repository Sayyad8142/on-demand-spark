# Admin handoff: worker bank self-service (PROPOSED, not deployed)

The Worker App now shows a bank form to workers with no bank details (or a failed
verification). It calls one Admin-owned RPC. Until Admin deploys it, the app
answers "opens soon, call manager" (it detects the missing function).

## 1. `public.submit_my_bank_details` (new, SECURITY DEFINER)
Args: `p_account_holder text, p_account_number text, p_confirm_account_number text, p_ifsc text, p_bank_name text`.
- Worker = `workers.user_id = auth.uid()::text`; no worker id accepted. Unauthenticated → error `not_signed_in`.
- Reuse `worker_bank_fields_valid` + the same checks as `register_worker_v2`; errors returned as
  `{ok:false,error:<code>}` with codes: `invalid_account`, `account_mismatch`, `invalid_ifsc`,
  `account_holder_required`, `bank_name_required`.
- Duplicate prevention: if the worker already has bank details and status is not `failed`, return
  `{ok:false,error:"already_submitted"}` (changes stay with the manager). Row lock (`FOR UPDATE`) so two
  taps cannot both write. Do not create a second record; update the one worker row.
- On success write the bank fields, reset beneficiary status so the existing
  `trg_sync_cashfree_beneficiary` / Cashfree flow runs; never touch `is_available`, dispatch,
  payouts or provider settings. Return `{ok:true}`. Audit row recommended.
- `GRANT EXECUTE ... TO authenticated`; revoke from anon/public.

## 2. `get_my_payout_readiness` (optional extra fields, display only)
- `bank_verification_status`: `pending` | `verified` | `failed`
- `bank_account_last4`: last 4 digits only (never full number)
- `bank_name`: text
Without these the app still works: verified = `beneficiary_registered`, no masked number shown.

## Must not change
Bank status never blocks ON, offers, acceptance or completion while Admin's bank switch is off.
