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

## Prompt 116 — live endpoint integration (20 Nov)
- Endpoint confirmed by Admin: `https://paywwbuqycovjopryele.supabase.co/functions/v1/app-release-report` (same backend as the app). Unauthenticated → 401; fake key → "Invalid, revoked or expired key".
- New: `DIDI_RELEASE_REPORT_KEY=drk_… node scripts/release-plan.js --fetch-approved [--write]` — GET Admin's approved version/build, strict parsing (worker/android only, whole-number build), applied exactly; lower build, errors or malformed answers refused, nothing written. 20 planner tests.
- **CONNECTION PENDING:** no valid release key is available yet, so no live GET/POST has been made. The exact GET response field names are NOT VERIFIED (parser accepts version/version_name + build/build_number, optionally under `release`); confirm on the first real call.

## Decision (owner, 20 Nov): use 10.0.05 (105)
No Admin server change. `ADMIN-PREPARE-REUSE-SOURCE-BUILD.NOT-DEPLOYED.sql` is WITHDRAWN (do not deploy).
Source stays 10.0.04 (104) until Admin prepares the release, so Admin computes max(102, 104) + 1 = **105**. Do not bump the files first: a recorded source of 105 would make Admin return 106.

## Steps (Admin, then owner's machine)
1. Admin baselines: live 10.0.02 / 102, highest uploaded 102 (from Play Console), source 10.0.04 / 104.
2. Admin prepares release 10.0.05 → expect build 105 → create report key.
3. `node scripts/release-plan.js --approved-version 10.0.05 --approved-build 105 --write` (updates Gradle + `src/config/version.ts`), commit, then `--send-phase 2 --status passed --evidence "Source Gradle and app config show 10.0.05 (105)"`.
4. `npm test`, `npm run build`, `npx cap sync android`, build signed AAB, then `--send-phase 3 --status passed --evidence "<N> automated tests passed; AAB built; real-device testing PENDING"`.
5. Real-device tests stay Pending; upload, production and mandatory update remain separate approvals.
