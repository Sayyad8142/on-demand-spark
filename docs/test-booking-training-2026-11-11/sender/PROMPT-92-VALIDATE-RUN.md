# Prompt 92 — Firebase validate-only run for Sid — 2026-11-12

Status: **NOT VERIFIED** (waiting for Sid's single tap). Sender switch: **off**.

## Test-only build (prepared)
- Send path opens only when built with `VITE_PRACTICE_TEST_BUILD=pilot-validate-2026-11-12`
  AND the signed-in login is Sid (8e03deed…). Normal web/Play/OTA builds: unchanged, off.
- Build on the owner's machine (release key):
  `VITE_PRACTICE_TEST_BUILD=pilot-validate-2026-11-12 npm run build && npx cap sync android`, then build the signed APK.
- Install on Sid's phone as an UPDATE over the current app (same release key, versionCode >= installed).
  Do NOT uninstall: that creates a new phone token and the sender will refuse (device_mismatch).
- Do not upload this APK to Play or OTA. Never publish the web app with this variable set.

## Live window (agent, one turn)
1. Owner says "Sid is ready".
2. Agent switches sender to `validate`, polls the attempts journal for Sid's attempt (max 10 min).
3. Sid taps "Send Test Notification" once.
4. Agent switches sender back to `off` in the same turn (also if nothing arrives).
5. Record: Validated (journal outcome `validated`) / Failed (reason) / Not Verified (no attempt).

## Checks recorded at that time
Firebase auth + message validation (validate_only 200), pilot login match, device fingerprint 28da92ed…,
rate limit row, no real push, no change to bookings / earnings / payouts.
