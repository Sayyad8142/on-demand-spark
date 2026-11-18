# Final readiness — Didi Now Partner Android 10.0.04 (104)

**Verdict: NOT READY FOR GOOGLE PLAY UPLOAD.** Source version is correct; release assets and hosted approval deployment remain unfinished. No AAB was generated or uploaded.

## Version and identity
- USER-REPORTED: Google Play production is **10.0.02 (102)**, checked by the user. This replaces the previous assumption that source build 103 was the production release.
- SOURCE: Android and app constants remain **10.0.04 (104)**. Release checks pass against 102.
- NOT VERIFIED: Internal/closed/open/draft upload history. Production 102 alone does not prove 104 was never uploaded; retain the all-track guard before upload.
- SOURCE: Package/namespace/Capacitor ID **app.didisnow.worker** preserved. Firebase's Android client matches it; Firebase configuration unchanged. No remote preview server configured.
- SOURCE: Gradle 8.11.1, AGP 8.9.2, Java/Kotlin target 21, compile/target SDK 36, app min SDK 24. Signing setup unchanged and external; no tracked keystore material.

## Android assets — UNFINISHED
- EXECUTED: `npx cap sync android` failed: **Could not find web assets directory ./dist**. No Android web assets were refreshed.
- NOT RUN: `npm run build`. This editing environment disallows manual project builds; its automatic preview compiler does not expose a production `dist` directory. No substitute development bundle or stale copy was used.
- EXECUTED: Bundled-asset verification fails on stale notification, approval and Start OTP UI markers. Existing packaged files are still old and must not be uploaded.
- IMPLEMENTED: Verification now checks current notification/approval/OTP markers, delayed-button CSS and byte-for-byte agreement between every production `dist` file and Android's packaged copy. Missing `dist` is a refusal, not a success.
- TEST: Four new fixture-based verifier tests pass: missing production output, mismatched copy, missing delayed style, and matching output. Fixtures do not establish that the actual Android bundle is current.

## Approval enforcement — STAGED FIX, NOT DEPLOYED
Fresh hosted read-only audit confirms:
1. Shared helper allows suspended legacy-exempt workers because it excludes only rejected.
2. Availability trigger can retain an already-ON rejected/suspended/pending-required worker after a status change.
3. `get_dispatch_eligible_workers`, `get_dispatch_eligible_worker_count` and `get_eligible_workers` lack direct shared approval checks.
4. `accept_booking_authoritative` lacks the direct approval check, so a stale ON row can bypass toggle-only enforcement.

Prepared `approval/STAGED-NOT-DEPLOYED.sql`, with read-only hosted originals in `approval/backup/`:
- Shared helper excludes rejected **and suspended**, even for exempt workers; approved allowed; legacy pending-review exemption preserved.
- Existing trigger reuses that helper, retains signup protection, refuses unauthorized ON, clears ON on revocation, never turns ON after approval.
- Adds only the approval predicate to the three eligibility readers; preserves ranking, slot/freshness/service/community rules and ordering.
- Adds early approval refusal in authoritative acceptance before booking writes; accepted/false and existing JSON response shape retained.
- No worker updates/backfills, exemption changes, grants/auth changes, timing, payouts, notifications or OTP edits.

TEST: Patch compiles in isolated local PostgreSQL. Tests exercise new pending refusal, approved access, legacy pending exemption, rejected/suspended with both flag values, missing data, signup self-approval prevention, old APK ON refusal, revocation, list/count parity/order, service/community isolation, stale-ON acceptance refusal and no automatic ON after approval. Approved/legacy acceptance passes the new guard and reaches existing Booking not found; a successful real booking acceptance was **not** tested.

NOT VERIFIED: Full hosted dispatcher coverage (other SQL/edge-function send paths), concurrent Admin revocation/acceptance, authenticated real booking flow and receiver behavior. The patch must be re-diffed against hosted definitions, reviewed with all send paths, and deployed through the database migration tool after separate approval. This request prohibits deployment, so **production gap is not claimed fixed**. No file under `supabase/functions/` or managed migrations was edited.

## Notification integration — SOURCE / TEST only
- Native Firebase token rotation forwards through Capacitor PushNotifications; web listener precedes registration and uses shared verified registration/readback.
- Native StartOtpAlarmPlugin remains registered; 10/15/20-minute alarm and cancellation logic untouched.
- Notification, optional overlay and foreground-service declarations preserved. Firebase/package/signing configuration untouched.
- Next Booking production flag remains false and its removed UI was not restored; OTA remains off. No Admin force-update settings changed.
- NOT VERIFIED: Actual phone permission flow, FCM delivery/notification display, locked/background alerts, APK upgrade/session persistence and merged release manifest/Play policy acceptance.

## Results
- **728 frontend tests passed, 66 test files.**
- **Isolated PostgreSQL approval suite passed**, compiling all six staged functions. Acceptance test exercises refusal/guard pass-through, not successful assignment or concurrency.
- Release version check against reported production 102 passed.
- Stale Android bundle verification correctly failed.
- Capacitor sync failed because `dist` is absent.
- Signed AAB script refused before build: Java/Javac unavailable.
- Native OTA check could not run: `kotlinc` unavailable. Android native/Robolectric compilation not run: JDK/SDK unavailable.
- No signing properties file or DIDI signing environment variables available; certificate match with Play App Signing not verified.
- Preview automatic compilation: build OK. No signed-in end-to-end checks available for external unmanaged authentication.

## Exact remaining local steps
1. Update your local project from the connected repository to this commit; preserve existing Android package, Firebase configuration and upload key.
2. Check all Play upload tracks/drafts, not only production. Keep 104 only if unused and above every uploaded code.
3. Install/select **JDK 21**, Android SDK/platform/build-tools for API 36, and Android Studio. Configure the existing upload keystore outside version control using `android/keystore.properties` or the four DIDI signing variables. Never share passwords in chat.
4. From project root run:

```bash
npm ci
npm run build
npx cap sync android
npm run android:verify-permissions
npm run android:release-check -- 102
```

Use 102 in the release check **only if it is the highest uploaded code across all tracks**, not merely production. If any step fails, stop; do not bypass asset verification.

5. Obtain separate approval for the staged backend patch, re-audit hosted function versions/all dispatch senders and concurrency, deploy through the migration tool, then verify new pending→Admin approve→manual ON and rejected/suspended refusal using isolated or separately approved scenarios. Preserve legacy exemptions. Do not publish while the hosted gap remains open.
6. Run `npm test` and native tests locally, then produce the signed bundle:

```bash
# After configuring JDK/SDK/signing; highest-uploaded argument verified above
npm run android:aab -- 102
```

Alternatively use Android Studio **Build → Generate Signed Bundle / APK → Android App Bundle** after successful build/sync. The existing AAB script runs Gradle `clean bundleRelease`. Expected output: `android/app/build/outputs/bundle/release/app-release.aab`.

7. Verify AAB signature/upload certificate, package, version name/code, target SDK, Firebase/native plugins and latest bundled UI. Complete actual Android upgrade from 102 and notification/offer/Start OTP/end OTP/approval/cancellation tests; preview/unit tests are insufficient.
8. Review Play permission declarations/Data Safety/pre-launch findings, then obtain separate upload/publication approval. Do not activate Admin force updates.

Read the [Capacitor build/sync workflow](https://capacitorjs.com/docs/basics/workflow#sync-your-project) and [Lovable local Git workflow](https://docs.lovable.dev/integrations/git-sync-overview#work-locally-in-your-ide). A Lovable Capacitor blog URL could not be verified; none is invented.

## Unfinished blockers
- Actual production web build and Android asset sync (environment does not expose production build output).
- Hosted approval patch deployment and complete dispatch/acceptance verification (separate approval; no deployment performed).
- Signed AAB/native tests (local JDK/SDK/Kotlin/upload key required).
- Physical Android and authenticated full flow (device/session required).
- All-track code uniqueness, Play policy review and separate upload approval.

Nothing published, deployed, sent as a real booking push, or activated in the Admin Panel.