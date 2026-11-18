# Didi Now Partner — Google Play release preparation

**Decision: SOURCE PREPARED; PLAY UPLOAD / PUBLISH NO-GO.**

## Versions
| Item | Previous | Prepared candidate |
|---|---|---|
| Android version name | 10.0.03 | 10.0.04 |
| Android version code | 103 | 104 (provisional) |
| In-app Profile footer | Version 103 | Version 10.0.04 (104) in web preview; native installed name/build when available |

SOURCE: Previous versions matched both `android/app/build.gradle` and `src/config/version.ts`.

NOT VERIFIED: Build 104 availability in Google Play Console. The history question was skipped. Candidate 104 is not certified unused. Before any upload, check App Bundle Explorer and all production, internal, closed/open and draft uploads. If 104 has been used, select an unused code above the highest uploaded code and update both configurations and the release tests; version name can remain 10.0.04.

## Updated files
- `android/app/build.gradle`: candidate 10.0.04 / 104 only; package/signing/dependencies unchanged.
- `src/config/version.ts`: matching candidate constants.
- `src/pages/Profile.tsx`: installed version name and build, through existing installedVersion helper; five-tap diagnostics preserved.
- `scripts/android-release-check.sh`: refuses missing/invalid highest uploaded code and reused/lower candidate codes.
- `scripts/android-build-aab.sh`: requires an explicit upload-history check and available Java/Javac before attempting the existing build flow.
- `src/lib/__tests__/androidRelease.test.ts`: release/version/package/activation guards.
- `src/lib/__tests__/startOtpCompat.test.ts` and `ackLegacyAndAvailability.test.ts`: update old 103 expectations to candidate 104.
- `roadmap.md` and this report: preparation status and blockers.

## Android configuration audit — SOURCE
- Package and namespace preserved: `app.didisnow.worker`.
- Capacitor app ID preserved; name `Didi Now Partner`, web directory `dist`, no remote preview server.
- Gradle wrapper 8.11.1; Android Gradle Plugin 8.9.2; Kotlin plugin 1.9.24.
- Java source/target and Kotlin JVM target 21; compile/target API 36; app minimum API 24. Shared variables still declare minimum 22, but app defaultConfig is 24; unchanged.
- Capacitor packages remain major 7. Firebase configuration contains a client matching the existing package. Firebase BoM and Messaging dependencies unchanged.
- Release signing remains external: ignored `android/keystore.properties` or existing DIDI signing variables. No signing material is tracked. This environment has neither signing properties nor configured signing variables; certificate continuity with Play App Signing is NOT VERIFIED.
- Existing GitHub workflow builds debug APK and an explicitly unsigned AAB. It is not a signed Play release pipeline and was not run.
- Unused legacy `scripts/increment-version.js` is CommonJS inside an ESM project and updates only Gradle code, not name/app constants. No active script/workflow references were found. Do not use it for this release; explicit paired edits were made instead.

## Recent updates included in source
| Area | Evidence and limits |
|---|---|
| Notification permission / FCM registration | SOURCE: permission/token separation, session-verified registration/readback, manual repair and resume checks; native registration listeners attached before registration. TEST: regression suite passed. Installed phone delivery NOT VERIFIED. |
| Availability / offers | SOURCE: existing Home toggle, realtime offer coordinator and single fallback poller remain connected; no dispatch timing/ranking changes. TEST: existing regressions passed. Hosted/phone end-to-end NOT VERIFIED. |
| Start OTP alarms | SOURCE: MainActivity registers StartOtpAlarmPlugin; native milestones 10/15/20 minutes, alarm audio usage, monotonic time, cancellation and foreground playback remain. TEST: client reminder/OTP regressions passed. Native compilation and physical-phone audio NOT VERIFIED in this run. |
| Start Booking card | SOURCE: green normal / animated red delayed button; no visible timer/play icon/separate warning. PRIOR PREVIEW: four widths, three languages and started/cancelled states checked in previous change. Timing and verification untouched. |
| Onboarding / approval | SOURCE: shared approval fields, tap-time recheck, own-row realtime and foreground refresh; existing-worker review exemption retained. TEST: approval/availability regressions passed. PRIOR HOSTED audit found missing direct approval checks in dispatch eligibility/authoritative acceptance; closing that backend defense-in-depth gap is outside this release-only scope and remains a gate. |
| Next Booking | SOURCE: production flag remains false, native cannot use preview-host exception, and the Next Booking tab was removed from app navigation previously. TEST: disabled flag and ranking regressions passed. No activation. |
| Force updates / OTA | SOURCE: OTA delivery still false; no Admin Panel update settings changed. No deployment or publication. |

## Synchronization / AAB readiness
**NOT READY FOR A VERIFIED SIGNED AAB IN THIS ENVIRONMENT.**

- OBSERVED: Android's committed web bundle is stale. `bun run android:verify-permissions` fails, missing `push-guard-native-resume`, `manual-repair-readback`, and `Booking_alert_connection_needs_attention`.
- OBSERVED: Packaged CSS lacks `booking-start-button-delayed`; packaged JS lacks the literal approval waiting message. These are additional synchronization warnings, not a complete inventory of all packaged behavior.
- OBSERVED: No `dist` directory, Java/Javac or Android SDK tools were available. No manual web build or stale asset copy was run. Preview compiler success does not establish release AAB contents.
- OBSERVED: Existing AAB script stops before building when Java/Javac is unavailable. No AAB generated, signed, inspected or uploaded.
- SOURCE: Signing can be supplied locally using the existing external configuration, but a real signed Android Studio build and certificate validation remain NOT VERIFIED.

## Tests / preview
- TEST: **724 tests passed across 66 test files** after final candidate updates.
- TEST: Release guard passes with simulated highest upload 103 and rejects highest upload 104, 105, unknown/invalid history and version mismatch. The simulated 103 input does not prove Play history.
- TEST: Release scripts pass Bash syntax checks; no tracked signing files detected.
- PREVIEW: Profile shows **Version 10.0.04 (104)** at 393, 734 and 1280px; five taps still open `/auth-debug`; no horizontal overflow or page errors. Guest display only, not authenticated workflow evidence.
- BUILD: Latest preview compilation reports build OK.

## Local signed AAB checklist — no automatic upload
1. Update your local project from the connected repository after these changes are saved. Do not replace package ID, Firebase files or upload key.
2. Confirm the highest uploaded Play version code; resolve provisional 104 before uploading.
3. Select JDK 21 and install Android SDK/platform/build tools for API 36 in Android Studio.
4. Install locked project dependencies (`npm ci`). Build the current web source locally (`bun run build`), then run **`npx cap sync android`** and `bun run android:verify-permissions`. The existing `bun run android:sync` combines icon generation, web build, sync and permission-bundle check.
5. Configure the existing upload signing key outside the repository. Never share passwords or keystore files in chat or commit them.
6. Run `bun run android:aab -- <confirmed-highest-uploaded-code>`. This existing script rebuilds/syncs and calls Gradle `clean bundleRelease`; alternatively use Android Studio **Generate Signed Bundle / APK → Android App Bundle** after synchronization.
7. Verify the AAB at `android/app/build/outputs/bundle/release/app-release.aab`: package, candidate name/code, target 36, upload certificate, bundled latest screens/notification markers, Firebase and native plugin contents. A successful file creation alone does not establish signing or correctness.
8. Complete real-device checks: upgrade from installed 103, session persistence, notifications denied→granted/token repair, real offer/acceptance in foreground/background/locked state, manual ON and admin approval, Start OTP alarm timing/stops, completion OTP/payment and cancelled booking cleanup. Use isolated or separately approved real booking scenarios.
9. Review Play permission declarations for overlay, exact alarms and foreground media/health services, Data Safety, privacy policy and pre-launch checks. Installed merged manifest and current Play policy acceptance are NOT VERIFIED.
10. Keep all production activation flags and Admin minimum-build settings unchanged. Upload/publication needs separate approval; no operation here uploads anything.

For local development background, read Lovable's [Git sync guide](https://docs.lovable.dev/integrations/git-sync-overview#work-locally-in-your-ide) and [native publishing FAQ](https://docs.lovable.dev/features/publish#can-i-publish-my-project-as-a-native-ios-or-android-app-to-the-app-store-or-play-store). An official Capacitor blog-post URL could not be verified from the available documentation; none is invented here.

## Outstanding release gates
1. Confirm build 104 is unused (or choose an unused higher code).
2. Rebuild and sync Android web assets locally.
3. Generate and validate a signed AAB with JDK/SDK and the existing upload key.
4. Verify authenticated and physical-phone booking/notification/OTP/approval flows.
5. Resolve or explicitly review the previously identified backend approval enforcement gap; no backend edits made here.
6. Review Play permissions/policies and give separate upload/publication approval.

Nothing was published, deployed, sent as a booking push, or activated in the Admin Panel.