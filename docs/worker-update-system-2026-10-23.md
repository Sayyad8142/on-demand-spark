# Worker App update system (Android only) — 2026-10-23

Status: implemented in development. NOT deployed, NOT published, no production settings changed.

## Needs deployment / approval
1. Admin Panel / database: add `app_config.latest_worker_version_code integer` (nullable). Until it exists the soft sheet never shows (version names are never compared).
2. Admin Panel: use `min_worker_version_code` + `worker_hard_update_enabled` (force) and `latest_worker_version_code` + `worker_soft_update_enabled` (soft). Store-link fields are ignored by the app.
3. New Android build (build 102 already contains this) via Play Store; native Play in-app update trigger is disabled in MainActivity.
4. Activating force/soft = editing those app_config values (owner approval required).

## Verified
- Play listing `app.didisnow.worker` returns 200; `com.didinow.partner` / `com.didinow.worker` return 404 (old fallback link was broken).
- Current production row: hard off, soft off, min build 1 → no prompt for anyone.
