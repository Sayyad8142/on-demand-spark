# Android 104 release flow sweep — 19 November 2026

**Rule:** Every Android install/release must contain the freshly built Worker App screens, never missing or stale packaged web files. This packaging rule applies across screens; it does not authorise production approval deployment or changes to dispatch, OTP, payments, settings or completed records.

## Places checked by reading code this review

| Place | Result |
|---|---|
| Vite production build / Capacitor config | Follow rule: default dist output and matching webDir; no remote preview server. Actual build still unavailable here. |
| npm/Bun android:sync and Unix android:build | Build → sync → verifier precedes Gradle. Follow rule. |
| Windows android:build:win | Build → sync → verifier precedes Gradle. Follow rule; uses Bun as before. Windows execution not verified. |
| scripts/android-build-aab.sh | Builds and verifies assets before bundleRelease. Follow packaging rule; signed output/certificate validation still required. |
| GitHub Actions manual Android workflow | Previously lacked verifier after sync. Added required verification before APK/AAB compilation. Workflow not executed. Its release artifact remains explicitly unsigned, not Play-ready. |
| Android Studio / direct Gradle APK/AAB | Previously could use old committed public assets without checking dist. Added preBuild dependency on shared Node verifier. Task reads only; no implicit build/sync or network operation. Gradle compilation not verified (no JDK/SDK). |
| Shared bundle verifier | Previously only checked dist→Android parity; extra obsolete Android files could survive. Now refuses extra files except Capacitor-generated cordova.js / cordova_plugins.js. Fixture tests passed. |
| README Android setup | Build/sync/verifier sequence already present. Source read, not executed. |
| README auto-OTP development/troubleshooting | Added missing build-before-resync and post-sync verifier instructions. Does not change OTP functionality. |
| All packaged screens (Home, Profile/language, Availability, booking/OTP, notification readiness/settings, rankings) | Share the single public/assets Vite bundle rather than independent release builders. Actual installed screen content remains NOT VERIFIED because dist is missing and packaged markers fail. No individual screen or signed-in flow claimed tested here. |
| Native notification/alarm/background jobs | Bundled through the same Gradle build; no separate web asset builder identified in inspected app Gradle. Their execution, FCM delivery, alarm stops and upgrade remain NOT VERIFIED. |
| Database approval helper/trigger, three eligibility readers, authoritative acceptance | Prior-turn staged SQL review and isolated PostgreSQL tests carried forward; no fresh hosted query or deployment. Backend functions do not produce Android assets. Existing-worker exemptions remain unchanged. Separate deployment approval/full sender/concurrency verification required before mandatory approval is release-safe. |
| OTA build helper | Read: separate OTA path, not invoked by APK/AAB commands; uses CommonJS in an ESM project and has separate update instructions. **OUT OF SCOPE:** user prohibited update activation and requested Android release only; unchanged, not executed. |

## Verification and limitations

- **730 frontend tests passed across 66 files**, including new rejection of extra stale Android assets and allowance for Capacitor bridge files.
- Prior-turn isolated approval tests passed; not rerun in this sweep and not evidence of hosted/real-booking enforcement.
- Preview build status checked separately. No manual production build, cap sync, Gradle native compilation or signed AAB generation performed.
- Actual production bundle is still absent; existing packaged assets remain stale. Added guards refuse rather than repair missing files. Run the Windows steps in `docs/play-release-104-2026-11-19.md` after updating local source, then sync and verify.
- New Gradle guard needs Node on Android Studio's process PATH; restart Studio after installing Node. It deliberately blocks packaging when dist is absent or verifier fails.
- JDK 21, SDK 36, original upload key/certificate match, all-track code uniqueness, physical-device upgrade/notification/OTP checks and backend approval deployment remain outstanding. No AAB readiness claim.
- Version 10.0.04 (104), package/signing identity/Firebase/backend preserved. No production records, permissions, example data, dispatch/ranking/payment/OTP timing, Next Booking activation or force-update settings changed. Nothing published.

Root AGENTS.md is at its size budget; packaging rules are recorded in `scripts/AGENTS.md` instead.

Before using native release commands, update the local checkout from the connected repository and run the documented successful web build followed by `npx cap sync android`. Please read the [Lovable community discussion of Capacitor work](https://lovable.dev/blog/supercharge-lovable-chrome-extension) alongside the exact Windows release instructions.