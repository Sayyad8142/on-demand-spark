# Prompt 89 predeployment backup and rollback

Verified before deployment: 73 source files, each checked against manifest.json.
Archive SHA-256: `87b0948ba5de6d384290aca7053df5f739ae7ba650621f807b885b606fbd37eb`.
The archive and manifest are stored in this project, not temporary storage. They contain source only: no secrets, dependencies, generated output or repository metadata.

Before preparation the practice endpoint returned HTTP 404 NOT_FOUND and the practice journal/functions were absent. There is no previous sender to restore.

## Stop and rollback (not executed)
1. Keep `PRACTICE_PUSH_SENDER=off` and app `PRACTICE_PUSH_ENABLED=false`.
2. Delete only the deployed `send-practice-notification` function using the function-deletion tool. Confirm its endpoint returns 404.
3. If removing the journal is approved, submit the preserved `staged/sql/001_rollback.sql` through the migration tool. Export any required practice evidence privately before dropping it. This script removes only the practice table and its three functions.
4. Remove only the practice function config section/source if approved; do not restore the entire config over newer work. Retrieve the source baseline from the archive for comparison.
5. Compare real public function definitions and policies to the captured baseline. The predeployment non-practice public-function hash was `4421621009c4da377145db36bda1939b`.

## Reviewed linter findings
The practice table intentionally has no worker/anonymous grants or policies: RLS default-denies all normal callers; service_role alone writes it. The admin report intentionally uses SECURITY DEFINER because admins have no direct table grant; it validates the login through `has_role(auth.uid(), 'admin')`, limits rows and shortens fingerprints. These two generic flags are intentional and are not resolved by granting workers access or removing the admin report. All other 184 findings predate this preparation.