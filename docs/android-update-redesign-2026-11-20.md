# Worker Android update screen redesign

## SOURCE — implemented, not published
- Shared full-screen optional/mandatory screen, pink-and-white worker illustration, requested heading and description, single fixed Update Now button; no build badges or support CTA. English, Hindi and Telugu display resources included.
- Optional close/Android Back uses the existing three-day/new-build snooze. Mandatory has no close, consumes Android Back, and prevents Escape dismissal. Existing Admin RPC, official Worker package and work/offer/OTP deferral remain authoritative.
- New native `WorkerStore` plugin launches `market://details?id=app.didisnow.worker`, explicitly targeting `com.android.vending`. Only `ActivityNotFoundException` falls back to the official HTTPS listing. Bridge errors show a retry message, not silent Chrome fallback.
- Tap lock, loading state and non-editable dialog focus. Listing opening does not imply installation success. Every update refresh now bypasses the installed-version memory cache; stale answers cannot prompt when the actual build meets their threshold.
- Native illustration URL resolves against the existing primary web domain, not the packaged localhost origin. Hosted illustration still requires web publication before a packaged release can retrieve it; no publication was performed.
- Version unchanged: 10.0.04 (104). No production policy, ranking, dispatch, availability, OTP authorization, alarms, auth, payouts or backend changes.

## VERIFIED — automated and isolated browser
- Full frontend suite: 761 tests, 69 files, all passed.
- Regression tests cover optional/mandatory native Back callbacks, mandatory Escape, tap lock, bridge error/retry, official web listing and suppression when already updated. Native APIs mocked; these are not physical-phone results.
- Actual production screen component rendered through a temporary browser harness on localhost, not a new app route or a live Admin policy. Viewports: 320×568, 393×805, 412×915, 1280×1800. Illustration loaded and CTA visible without page scrolling; screenshots inspected. Optional Escape dismissed, mandatory remained. Web CTA opened the exact Worker listing. No editable focus or page errors.
- Preview build log: build OK. Reported use-mobile diagnostic text is not in source; the hook explicitly imports React hooks and was left unchanged.

## NOT VERIFIED — required on real Android
1. Update local code from the connected repository. Run `npm ci`, `npm run build`, then `npx cap sync android` and `npm run android:verify-permissions`. Native plugin registration requires a new signed binary; an OTA-only update is insufficient.
2. Build/install with the existing signing key as an update, never uninstall first. Verify first tap opens the Google Play app, rapid taps do not open twice and keyboard stays closed.
3. Verify Play-unavailable device/emulator takes the browser fallback. A bridge error must show retry instead.
4. Using an approved test configuration, optional close/Android Back snoozes; mandatory Back cannot continue; offers, active bookings, loading booking data and both OTP workflows remain protected.
5. Return from Play and verify actual installed version/build is re-read. After upgrading, no stale prompt. If Play shows Open rather than Update, check accepted/published build, release track, account eligibility, country/device targeting and rollout in Play Console; do not mark that as an update.
6. Test smallest phone, landscape, system insets, all three languages, reduced motion and illustration loading from the published domain.

No signed APK/AAB, native compilation, device check, production publication, deployment or force-update activation was performed. Android asset sync remains blocked here by unavailable production dist/manual build restriction; never sync stale assets.

Native setup guide: https://docs.lovable.dev/tips-tricks/mobile-apps