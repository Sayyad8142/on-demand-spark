# Prompt 88 — Test Booking notification blockers: implementation results (12 Nov)

## Decision
- **GO** to request deployment approval for a one-phone test (all source-level security blockers fixed and tested).
- **NO-GO** for sending to any phone today: nothing is deployed, both switches are OFF, and the
  live Firebase check, approved account/phone and real-phone evidence still need your separate approval.

## Backup
68 files archived and checksum-verified before any change: `/tmp/practice-backup-88` (sandbox, temporary).

## Blockers from prompt 87 → status
| # | Blocker | Status |
|---|---|---|
| 1 | Packaging | FIXED. `staged/send-practice-notification/` is self-contained (core, adapters, handler, entry). Test enforces no outside imports. `deno check` passes; the copied folder was run locally: switch unset/"yes" → 503 refused, no/fake login → 401 (verified against a mock Auth server). |
| 2 | Firebase auth + FCM transport | FIXED IN SOURCE, LIVE NOT VERIFIED. Signing matches the production `send-fcm` method (same `FIREBASE_SERVICE_ACCOUNT_KEY`, exists by name). New `PRACTICE_PUSH_SENDER=validate` mode sends FCM `validate_only` — proves credentials + message with **zero delivery**. CORS now allows all headers the app client sends. |
| 3 | Hosted authentication | FIXED. `config.toml.snippet`: `verify_jwt = false` like every function here; identity is checked in code on every request via Supabase Auth, then pilot login + device fingerprint. Tests prove refusal without a valid login. |
| 4 | Native race / real work priority | FIXED. Phone accepts a practice push only within 30 s of preparing it (phone clock only — no clock-skew risk), after the server's two real-work checks; local busy/live offer refuses; any real booking message closes practice immediately. |
| 5 | Session/evidence races | FIXED. Opening the page no longer clears a session still waiting for its push; late send replies for an old/reset practice are ignored; leaving the page cancels the phone session so a delayed push is dropped. Logout/account switch drop it (native login check). |
| 6 | Token binding after receive | FIXED. Push carries the device fingerprint; phone blocks pushes addressed to a different token; token change cancels the session. |
| 7 | Approved account/phone | OPEN — needs you to name the worker account and phone. |
| 8 | Real-phone evidence | OPEN — needs the phone after deployment approval. |

## Practice log
`practice_push_attempts` (staged SQL, not applied): no worker/anonymous access; admin-only read function
(role check via `has_role`, fingerprint shortened to 8 chars); 30-day retention purge on each claim;
duplicate refusal, one outstanding attempt, 3 per rolling hour; new no-delivery outcome `validated`.
Local disposable PostgreSQL rehearsal: all assertions passed (quota, recovery, duplicate, outcome never
overwritten, retention, non-admin refused, admin reads shortened hint), rollback leaves nothing.

## Practice can never call production booking services
Tests scan the native practice code and the practice screens: no network, booking sync, offer claim,
busy flag, delivery confirmation, accept/reject/OTP RPCs. Practice push exits before any real handler.

## Checks run this time
- App tests: **534/534 pass** (46 files; new `practiceBlockers.test.ts`, 16 tests). Type check: pass. Preview build OK.
- Android: debug compile **successful**; **38/38 native tests pass** (5 new). Build output removed from the project; nothing published.
- Security scan: no findings about Test Booking; existing findings are unrelated older tables.
- Secrets (names only): `PRACTICE_PUSH_SENDER`, `PRACTICE_PILOT_USER_ID`, `PRACTICE_PILOT_TOKEN_SHA256` absent → server OFF. App `PRACTICE_PUSH_ENABLED=false` → app OFF.

## Residual risk (accepted for a one-phone pilot)
A real job accepted on a *different* phone during the 30 s window, with no message to the test phone, could
still let a practice popup show. It is display-only and cannot touch the real job.

## Next steps — each needs your separate approval
1. Name the worker account + phone. 2. Apply 001 SQL. 3. Deploy the folder + snippet with the switch OFF, prove 503.
4. Set pilot secrets, switch to `validate`, prove Firebase accepts with no delivery. 5. Test-only native build for that phone.
6. Switch `on`, run DEVICE_TEST_CHECKLIST.md. 7. Switch back OFF.
