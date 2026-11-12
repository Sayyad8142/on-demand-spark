# Sender staging
- Keep the practice sender staged here (core, adapters, entry, SQL) and never under `supabase/functions/` or applied to the database until the owner approves deployment; it must refuse unless `PRACTICE_PUSH_SENDER=on`. Why: saving a function file auto-deploys it, and delivery must pass device tests first.
- Bind the sender pilot to one verified login and token hash; serialize quota claims in SQL. Why: other accounts/devices and concurrent attempts must never bypass controlled testing.
