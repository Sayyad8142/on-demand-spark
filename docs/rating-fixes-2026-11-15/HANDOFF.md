# Rating fixes — release gates

Frontend changes are implemented, not published. Database SQL is staged, not executed.

## Exact required action

Approve the privacy migration in `required-database-change.sql` only after the User App and Admin/ranking owners verify it against an isolated database. It must be applied using the database migration tool, not copied into a function directory. Back up existing policies/function definitions first.

Required checks before execution:
- Confirm customer sessions map to `profiles.id` or `profiles.firebase_uid`; no phone-supplied identity or phone fallback is allowed by the proposed policies. Verified service-role User App writes remain possible, but that server must authenticate and derive customer identity independently.
- Inventory and adapt ranking consumers that directly read `worker_ratings` or the security-invoker `worker_rating_stats`. Restricted individual reads will change that view's visible aggregates. Preserve existing ranking rules using authorized server-maintained aggregates or an approved aggregate-only endpoint; do not deploy this SQL until parity is proven.
- Check worker/customer dual-role handling: worker logins are deliberately prohibited from customer-rating writes. Verify the User App's server contract if dual-role accounts must submit feedback.
- Verify authenticated customer insert/upsert, exact booking+worker linkage, updates with immutable linkage, invalid score refusal, worker/anonymous insert/update/delete refusal, pre-completion feedback refusal, completed-only worker reads and admin role reads.
- Rehearse existing rating insert/update/delete triggers: averages and counts must include all saved customer ratings even when worker individual reads are restricted. Test both old and new worker linkage on server reassignment.
- Investigate direct `workers.rating`/`total_ratings` writes. Existing broad worker UPDATE permissions may allow aggregate tampering. An approved column-protection trigger or column privileges must block worker rating/count edits while preserving existing availability/profile writes and privileged recomputation. No broad workers-policy change is applied here.

No new rating gate exists in worker OTP verification. The customer server remains responsible for OTP reveal. Test Start → customer rating saved → reveal → worker completion → rating refresh with a real authorized session on isolated services; also test failed customer submissions and retry without payout/dispatch changes.

## Current limits

External unmanaged Supabase sessions cannot be minted here. Signed-in end-to-end verification, latest User App source/server parity, database policy execution and physical-phone release checks remain unverified. Production individual-rating privacy is not fixed until approved database enforcement is applied. Browser filtering alone is not an authorization boundary.

The quoted hook has named React imports; `src/routes/__root.tsx` is absent from this React/Vite project. No invented Window property or unrelated hook rewrite was added.