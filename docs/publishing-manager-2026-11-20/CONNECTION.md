# Worker App ↔ Admin App Publishing Manager — connection (20 Nov 2026)

Nothing published, deployed, uploaded or activated. Source stays 10.0.04 (104). Own draft receiver withdrawn (superseded).

## Admin contract (hosted, read-only checks)
- Release: Admin `admin_prepare_next_release` → version + build, phases 1–7. Report key from `admin_create_release_report_key` (`drk_` + 48 hex, 14 days, stored hashed).
- Reports: `POST /functions/v1/app-release-report`, header `x-release-key`, body `{phase 2|3, status running|passed|failed, evidence ≥10 chars, repo_version, repo_build}`. Phase 2 "passed" only if source equals the release version/build. Probes with fake keys: 401 without key, field validation errors, "Invalid, revoked or expired key". No release recorded.
- Hosted worker/android baseline: empty (no live, highest uploaded or source values). No worker release exists yet.

## App side (SOURCE)
- `node scripts/release-plan.js --approved-version <v> --approved-build <n> [--write]` — applies the Admin-approved version to Gradle + `src/config/version.ts`; equal = no change; lower/same build refused.
- `DIDI_RELEASE_REPORT_KEY=drk_… node scripts/release-plan.js --send-phase 2|3 --status … --evidence "…"` — key only from the environment (never repo/app); sends source version from the files.
- Worker App bundle sends nothing new and holds no publishing credentials. 14 planner/report tests.

## Blocker: Admin would give 105, not 104
Admin computes build = max(highest uploaded, live, source, past releases) + 1. Once the source 104 is recorded it returns **105**; if not recorded it returns **103** (conflicts with prepared 104). Options:
1. Approve `ADMIN-PREPARE-REUSE-SOURCE-BUILD.NOT-DEPLOYED.sql` (reuses source build 104 when it is above every uploaded/live/past build and the version matches), or
2. Accept 10.0.05 (105): `--write` applies it.

## Steps after the decision (Admin, then owner's machine)
1. Admin baselines: live 10.0.02 / 102, highest uploaded 102 (from Play Console), source 10.0.04 / 104.
2. Prepare release 10.0.04 → create report key.
3. `--approved-version 10.0.04 --approved-build 104` (no change), then `--send-phase 2 --status passed --evidence "Source Gradle and app config show 10.0.04 (104)"`.
4. `npm test`, build AAB, then `--send-phase 3 --status passed --evidence "<N> automated tests passed; AAB built; real-device testing PENDING"`.
5. Automated: 746 tests passed (20 Nov). Real-device tests stay Pending; upload, production and mandatory update remain separate approvals.
