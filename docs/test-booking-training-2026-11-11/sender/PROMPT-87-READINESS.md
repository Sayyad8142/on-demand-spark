# Prompt 87 — controlled Android practice test readiness

## Decision
**NO-GO for activating or sending the controlled phone test today.**
GO for reviewing the preparation. No backend files, database objects, secrets, approval
switches, published app or APK were changed. This review adds documentation only.

The previous automated results do not certify a deployable sender or phone behavior.

## Evidence checked on 12 November
| Area | Result |
|---|---|
| App regression suite | VERIFIED THIS RUN: 519/519 tests, 45 files |
| Android tests | PRIOR saved XML: 33 tests, zero failures |
| Android compilation | PRIOR saved log: BUILD SUCCESSFUL; not rerun for this documentation-only review |
| Production practice log and two RPCs | VERIFIED READ-ONLY: all absent |
| Client approval switch | SOURCE: PRACTICE_PUSH_ENABLED=false |
| Server approval switch | SOURCE: refuses unless PRACTICE_PUSH_SENDER=on; secret-name read shows it absent |
| Pilot settings | Secret-name read: PRACTICE_PILOT_USER_ID / PRACTICE_PILOT_TOKEN_SHA256 absent |
| Credentials | FIREBASE_SERVICE_ACCOUNT_KEY exists by name; value, validity and project match NOT VERIFIED |
| Hosted practice function/config | No repository function setting; hosted inventory/auth settings NOT VERIFIED |
| use-mobile diagnostic | SOURCE: named React hook imports, quoted prompt phrase absent; no source fix warranted. Current observability logs unavailable; no new typecheck/build claim |

## Protections implemented in source
- Verified Supabase Auth user lookup, not JWT decoding or anon-key identity.
- One worker resolved by verified user_id; ambiguous/missing links refuse.
- One server-approved pilot login and token SHA-256; empty settings refuse all workers.
- Client submits only practice_id, expiry and phone token fingerprint, never arbitrary token/worker/booking ID.
- Worker token must be active, Android, match the phone fingerprint and pilot fingerprint; rechecked before send.
- Real-work/pending-offer reads before claim and again before sending, fail closed on read failure.
- Practice-only SQL journal: explicit service-role grants, RLS, no worker grants, service-only RPC execution.
- Atomic per-login claim, duplicate refusal, one outstanding attempt, three claimed attempts per rolling hour.
- Practice FCM data contains no customer booking identifier or real OTP. The native practice branch returns
  before production heartbeat, delivery ACK, dispatch/OfferQueue handlers.
- Practice alert components are non-exported. Accept/Reject record only practice preferences; Accept opens
  test-booking, both OTPs are local 1234. Shared layout/sound do not share real booking actions.
- Current sender writes only practice claim/outcome RPCs. It reads real work but does not write bookings,
  dispatch, availability, worker identity, earnings, wallet transactions or payouts.

This establishes SOURCE isolation and mocked regression evidence, not an absolute production guarantee.
Opening MainActivity can run the app's ordinary heartbeat/token-sync logic; practice FCM itself skips it.
Before/after comparisons must distinguish these ordinary lifecycle updates from prohibited practice writes.

## Remaining blockers before activation
1. **Deployment packaging:** copying only send-practice-notification/ breaks ../adapters.ts and ../senderCore.ts
   imports. Package dependencies inside that function or approved _shared/ paths, then verify the actual deployment bundle.
2. **Transport/CORS:** staged sender directly signs service-account OAuth and calls FCM. Complete approved Firebase
   connection/transport review and supported SDK CORS integration before deployment; do not reuse production send-fcm.
   No connection was linked or credential test performed in this review.
3. **Hosted authentication:** staged comment says verify_jwt=true, but this is not established hosted configuration.
   Review signing-key compatibility and platform JWT settings; retain mandatory in-code Auth user verification.
   Never disable identity checks to make a test pass.
4. **Native race safety:** native idle checks are a 10-minute local flag plus queued offers, not authoritative long-job
   state. A job can begin after the last server check, especially via another device, while JS is dead. Current source
   cannot guarantee that practice never interrupts such work; add/prove a fail-closed freshness/active-work guard.
5. **Session/evidence races:** the initial restore effect cancels the native session in finally even when there is no
   accepted state. Sending during that asynchronous restore can lose the prepared session. Cleanup/unmount and
   native alert close-after-launch also need foreground/cold-start evidence-preservation tests. These paths are not
   certified by the current mocked sender tests.
6. **Token binding after receive:** receipt validates practice ID, expiry and current login; stored token hash is not
   compared at receipt. Token-change cancellation is present, but race/order behavior needs device verification.
7. **Approved identity/device:** no worker account or Android device has been explicitly selected for this test.
   Obtain the worker/account identifier and device model from the owner; do not choose an arbitrary account.
8. **Phone evidence:** sound, vibration, popup, background/locked/closed delivery and the complete FCM-to-OTP
   journey remain NOT VERIFIED. No live test is permitted before separate approval.

## Exact proposed deployment and switch sequence — NOT executed
Only after the blockers above are resolved and separately approved:

1. Capture backups/settings and approve a single worker login plus its specific Android installation.
   Match the device's current native token fingerprint to that worker's stored active Android token.
   Never paste raw tokens, service-account JSON or login JWTs into chat.
2. Apply staged 001_practice_push_attempts.sql using the approved migration process. It creates only
   practice_push_attempts, claim_practice_push_attempt and record_practice_push_outcome. Do not apply
   002_practice_limit_test.sql to production. Recheck grants/RLS/RPC restrictions after deployment.
3. Deploy the corrected packaged send-practice-notification with reviewed JWT settings and CORS.
   Keep PRACTICE_PUSH_SENDER unset/off and client PRACTICE_PUSH_ENABLED=false. Prove disabled requests send nothing.
4. Securely configure PRACTICE_PILOT_USER_ID to the verified Auth UUID and PRACTICE_PILOT_TOKEN_SHA256 to the approved
   installation's lowercase SHA-256. Configure the reviewed transport's required secrets; do not enable general access.
5. Prepare an approved test-only native build with PRACTICE_PUSH_ENABLED=true, distribute only to that phone.
   Public/release client remains false. Update the local project first, then run npx cap sync; do not publish an OTA
   bundle or release APK to all workers. Read the native guide: https://lovable.dev/blog/capacitor.
6. With separate activation approval, set PRACTICE_PUSH_SENDER=on and redeploy the corrected sender to pick up settings.
   Both client and server gates must permit the test; pilot login/device checks still reject everyone else.
7. Run DEVICE_TEST_CHECKLIST.md. Prove actual receipt/display and both 1234 steps; provider acceptance alone is not
   receipt. Capture before/after real-booking/dispatch/payment/payout values, not only counts. Use practice only.
8. Immediately return PRACTICE_PUSH_SENDER to off and redeploy after the controlled window. Remove/disable the test
   client, cancel its practice session and retain journal evidence. Already-submitted pushes may arrive until expiry
   (up to 60 seconds); switching off does not recall them. Never delete journal evidence as the first rollback action.

**Approval alone does not remove technical blockers.** Resolve and verify them first, then request activation approval.