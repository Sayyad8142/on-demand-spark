# Worker App ↔ Admin Panel — Payout RPC Authentication Contract (v1 addendum)

Status: read-only audit, 2026-11-10. Nothing deployed or changed. Labels: SOURCE (repo code), LIVE (read-only DB query), PROPOSED.

## 1. Finding: there is no Firebase/Supabase auth mismatch for the payout RPCs

| Question | Answer | Evidence |
|---|---|---|
| How do workers log in? | **Supabase Auth phone OTP** (`signInWithOtp({phone})` → `verifyOtp({type:'sms'})`). Play reviewer demo uses `signInWithPassword` (email). | SOURCE `src/pages/Auth.tsx:504,626,427`, `src/pages/OtpVerify.tsx:195,422` |
| What is Firebase used for? | **Push notifications only** (FCM tokens, `MyFirebaseService`, boot token sync). No Firebase sign-in or ID token is sent anywhere. | SOURCE `src/lib/pushToken.ts`, `src/hooks/useFCMTokenSync.ts`, Android `MyFirebaseService.java`; `src/lib/otpV2.ts:25` "No Firebase token" |
| How does the app reach Supabase data? | The supabase-js client holds the Supabase session (storage key `didi-worker-session`, auto refresh); every `from()`/`rpc()` sends its access token. Native overlay gets the same JWT via `AuthBridge.saveToken`. | SOURCE `src/integrations/supabase/client.ts`, `src/contexts/AuthContext.tsx` |
| Server-side Firebase token verification? | **None in this repo** — no edge function verifies Firebase ID tokens. (Older project notes claiming Firebase auth are outdated.) | SOURCE: no `verifyIdToken`/`firebase-admin` under `supabase/functions` |
| Auth providers in use | `phone`, `email` only; 0 anonymous users. | LIVE `auth.identities` |
| Worker ↔ login mapping | `workers.user_id = auth.uid()::text` and `workers.id = auth.uid()`. All 44 workers linked, 0 orphans, 0 duplicates, 0 where id ≠ user_id. | LIVE |
| Existing pattern already working | `verify_start_otp` resolves the worker from `auth.uid()` server-side with no worker id from the phone. | LIVE function source |

Conclusion: the four contract RPCs can use `auth.uid()` exactly as written. **No new login mechanism and no Firebase verification are needed.**

## 2. Required server behaviour (PROPOSED, for Admin Panel)

1. Functions `get_my_payout_summary`, `get_my_payout_history`, `get_my_payout_detail`, `get_my_earnings`: `SECURITY DEFINER`, `SET search_path = public`, `STABLE`.
2. First lines:
   ```sql
   v_uid uuid := auth.uid();
   IF v_uid IS NULL THEN RAISE EXCEPTION 'not_a_worker'; END IF;
   SELECT id INTO v_worker FROM workers WHERE user_id = v_uid::text LIMIT 2;  -- error if 0 or >1 rows
   IF NOT FOUND THEN RAISE EXCEPTION 'not_a_worker'; END IF;
   ```
   Error text must contain the exact code (`not_a_worker`, `invalid_cursor`, `not_found`) — the app matches on it.
3. No parameter may name a worker. Detail returns `not_found` for another worker's payout (no existence leak).
4. `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`
5. Recommended safety (separate approved migration): make `idx_workers_user_id` a UNIQUE index — today it is non-unique although data has no duplicates.
6. Blocked/paused/archived workers: Admin Panel decides whether they still see history (suggest: yes, read-only).

## 3. Worker App side (already built, switched off)

- `src/lib/hybridPayoutApi.ts` calls `supabase.rpc(name, args)` — the session token is attached automatically; args never contain a worker id.
- On `not_a_worker`, network error or malformed data the section renders nothing and the existing payout screens remain.
- `HYBRID_PAYOUT_UI_ENABLED = false` stays until §4 passes.

## 4. Test requirements before switching on

Server (Admin Panel, staging then production):
1. Signed-in worker A → summary/history/detail/earnings return A's data only.
2. Worker A requests worker B's payout id → `not_found`.
3. No session (anon key only) → permission denied / `not_a_worker`.
4. Signed-in non-worker (customer/admin with no workers row) → `not_a_worker`.
5. Expired token → 401; after client refresh the call succeeds.
6. Bad cursor → `invalid_cursor`; limit 0/500 clamped to 1/50.
7. Function grants: anon has no EXECUTE.

Worker App (with a real signed-in worker, after deployment):
8. Phone OTP login → section loads, amounts equal Admin Panel values.
9. Demo login (9999999999) → `not_a_worker` or demo data, never another worker's money.
10. Logout/login as a different worker on the same phone → no previous worker's data shown.
11. App resumed after >1 h (token refresh) → still loads.
12. Old app versions keep reading `worker_payouts` unchanged.

## 5. Notes outside this scope (not changed)

- `OtpVerify.tsx` sign-in updates `workers.id` by phone from the phone; harmless today (all already linked) but should move server-side (e.g. `ensure_worker_profile`) in a separate approved change.
