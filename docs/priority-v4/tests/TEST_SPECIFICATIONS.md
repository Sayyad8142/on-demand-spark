# Prepared versus executed tests
Pure tests cover candidate math, exact rounding, duplicate quarantine, known-at/time windows, trust gates, thresholds, neutral O/A, canonical mock identity/ownership/status contracts. They use synthetic literal IDs and timestamps, no production records or credentials. Actual result belongs in PHASE_3_REPORT.md after execution. They do not prove live permissions or cryptographic authentication.

## Isolation protocol
Read all local test/import files; enforce imports restricted to local listed pure files and built-in bun:test. Static reject service/environment/network/filesystem/process capabilities, dynamic imports and require. Launch runtime with env -i (only PATH/HOME temporary directory); no app/Vitest setup/config, preload, dependencies, Supabase/Firebase/Capacitor imports or credentials. Source path supplied is the draft test only. No package install. Code under test has no transport or filesystem access; assurance is against reviewed pure source, not an OS network sandbox. If scanner fails, don't run. Kernel-level network denial is not established or claimed.

## Prepared only — isolated database harness required
- Every table effective GRANT and RLS tested separately as anon/authenticated/service; own/cross-worker INSERT/UPDATE/upsert and indirect views/RPC attempts denied. Permitted profile/registration succeed with supported payloads; no direct role/body escalation.
- Forged/wrong-project/expired/revoked/disabled Firebase tokens, supplied-worker mismatch, UID collision, legacy UUID fallback, ownership and booking/round mismatch; no sensitive logs. Mock contracts cannot prove signatures.
- Concurrent producers on same canonical fault/opportunity converge unique key; distinct generation/cause persists; ambiguous generation reviewed; immutable correction chains and known-at snapshots preserved.
- 20 simultaneous recalculations: lock before snapshot; history and projection atomic; stale/equal-as-of correction policy; serialization retry, failed transaction rollback, no partial onboarding/projection; identical input replay key returns same row. Parallel pure calls are NOT this test.
- SQL parse/apply ordering, roles/schema access, generated duration compatibility, constraint violations, immutable service writes blocked, restricted helpers executable only by approved service.
- Trusted availability intervals overlap/union/IST midnight, explicit OFF/leave/unknown gaps/active service and attribution exclusions. Current engine locks A=6, so duration activation tests are specifications only.
- Responsiveness future candidate formula, trusted continuous interval union, confirmed-response latency fallback, one redelivery round, failed submission and withdrawal censoring. Current engine locks O=12: no unlocked formula implemented/tested.
- Independent reference arithmetic/database rational-decimal parity, R mass saturation/late policy, Q mass cap and complaint mapping approval, corruption/property tests. Full independent reference not supplied; exact rational unit checks are narrower.

## Prepared only — real supported Android/device harness required
Current anon ACK and aliases, new Firebase token, no token/capability, 401/403 backoff/TTL, late loss, duplicate event, reboot/killed/Doze, session change/logout, watchdog cancellation/tray behavior. Verify FIFO/dedupe, accepted-busy ownership, manual OFF and nonblocking Accept/Reject untouched; no OTP/payout/dispatch/availability side effects. No physical device execution now.
