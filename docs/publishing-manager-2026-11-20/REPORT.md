# Worker App ↔ Admin Publishing Manager — preparation report (20 Nov 2026)

Verdict: **PREPARED, NOT CONNECTED.** Nothing published, deployed, uploaded or activated. Version stays 10.0.04 (104).

## 1. Automatic build preparation
- SOURCE (new): `scripts/release-plan.js` (`npm run release:plan -- --highest <code>`). Reads Gradle + `src/config/version.ts` (refuses if they disagree), takes Google Play's highest accepted versionCode (all tracks), computes the next valid code/name, dry run by default, `--write` updates both files together, `--report` writes the status JSON. Refuses to guess when store info is missing or the name pattern overflows. 8 tests.
- Today: highest 102 → `already_prepared`, 10.0.04 (104), no change. After 104 is accepted → 10.0.05 (105).
- SOURCE (new): Android workflow input `highest_accepted_code` runs the plan (dry run) and uploads `release-status.json`.
- MISSING: automatic Google Play lookup needs a Play Developer API service account stored as a CI/Admin server secret (never in the app). Until then Admin must supply the highest code.
- MISSING: Admin "Prepare for Next Build Publish" must trigger the workflow (GitHub `workflow_dispatch` from an Admin server function holding a GitHub token). The Admin Dashboard project is not accessible from here.
- Signed AAB still needs the upload key on the owner's machine or as CI secrets; the CI AAB is unsigned.

## 2. Critical testing
- Automated: full vitest suite — 740 tests passed (67 files) on 20 Nov. Covers mocked login gates, availability gate, offers/accept/reject outcomes, Start/End OTP, alarms, update safety.
- NOT VERIFIED (needs a real phone + signed build): worker login, ON/OFF, FCM delivery foreground/background/locked, full-screen alert, Accept/Reject, Start and Completion OTP, timers/alarms, update-over-install session preservation. Use `docs/play-release-104-2026-11-19.md` and the device checklist; record results in the report `tests` field.

## 3. Mandatory update (already in place — SOURCE + hosted read)
- App asks `get_app_update_decision` (worker/android, installed build) on start and every resume; `ForceUpdateScreen` has no skip, Update Now opens the official Play listing (`app.didisnow.worker` only).
- Force is deferred during offers, active bookings, OTP screens or while bookings are loading.
- Server only returns `force` when Admin verified the store version (`store_verified_version = latest_version`) and the force approval flow (`app_update_force_approvals`) exists.
- Hosted state now: worker/android policy **inactive**, soft, latest 6.0.66 build 1, store not verified → no prompts. Leave untouched until 104 is live in Play.
- NOT VERIFIED: Update Now handing off to the Play app on a real phone.

## 4. Status reporting
- STAGED, NOT DEPLOYED: `STAGED-NOT-DEPLOYED.sql` — admin-only `admin_submit_app_release_report` (validated, size-capped; store/production/mandatory fields stripped because the server owns them) and `admin_worker_release_status` (latest reports + live policy incl. `mandatory_effective`). No client policies on the table.
- The Worker App sends nothing new and holds no publishing credentials; installed version keeps flowing via the existing heartbeat.

## Remaining requirements
1. Approve deploying the staged SQL (production change).
2. Admin Dashboard: buttons calling the two functions + workflow trigger (other project).
3. Play Developer API service account (server secret) for automatic highest-code lookup and upload status.
4. Upload key for signed AAB (local or CI secrets).
5. Real-phone critical tests on the signed build.
6. Separate approvals: upload to Play, then mandatory-update activation only after 104 is publicly available.
