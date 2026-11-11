# Update system fixes — 2026-11-11

Nothing in this folder has been applied to the database or deployed.

| File | What | Risk |
|---|---|---|
| 01_version_monitoring_observe_only.sql (+ rollback) | Admin fleet-by-build view, optional app-event receiver | Read-only / new table |
| 02_ota_bundles_hardening.sql (+ rollback) | Require sha256, size, approved URL on OTA rows | 0 rows today |
| 03_worker_heartbeat_identity_guard.md | Staged receiver change in 3 modes | Stage 3 needs dispatch approval |

App switches that stay OFF until owner approval: `OTA_DELIVERY_ENABLED` (src/lib/otaSafety.ts),
`APP_HEALTH_SERVER_SYNC_ENABLED` (src/lib/appHealthLog.ts). Forced updates stay off: the
worker/android row in app_update_configs is inactive and was not touched.

Release: `bun run android:release-check <last_released_code>` then `bun run android:aab <code>`
(keystore outside the repo; nothing is uploaded).

## Applied 2026-11-11 (owner GO for 1, 2)
- 01 applied: `admin_worker_version_fleet()` (admin-only), `worker_app_events` table (admin read only), `log_worker_app_event` (login identity only). Verified: anon cannot execute either function; 0 events (app sync still OFF).
- 02 applied as immediately-validated CHECKs (0 rows) + `..` path guard. Rollback: 02_rollback.sql.
- 03 NOT deployed: editing supabase/functions auto-deploys to production; stays a handoff until observe mode is reviewed. Enforcement NO-GO.
- Unchanged: app_update_configs worker row inactive, 0 OTA bundles, OTA/forced/min-build OFF.
