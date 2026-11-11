# Test Booking preview implementation — 11 November 2026

## Status
Preview UI implemented. No backend deployed, migration submitted, publish performed, APK built or production service called for testing. `PRACTICE_PUSH_ENABLED=false` is intentional. The whole real-push system is NOT complete until the sender is approved, implemented and verified with the native build.

## Backup and original behavior
`backup/test-booking-before-2026-11-11.zip` contains the eight existing affected files plus a SHA-256 manifest. Archive integrity and each checksum were verified before edits. Original training was local intro → alert → details → completion OTP → done. No Start OTP, no real FCM, timer restarted, sample amounts ₹249/₹199 and flat A-1204. An independent development-only tool inserted a real ₹500 instant booking; removed its handler and rendered controls.

## Affected files
Existing: src/pages/{Home,TestBooking,Troubleshoot}.tsx; android/app/src/main/AndroidManifest.xml; android/app/src/main/java/app/didisnow/worker/{MainActivity.kt,MyFirebaseService.java}; AGENTS.md; roadmap.md.
New: src/lib/{practiceBooking,practiceNotification}.ts; src/hooks/usePracticeSafety.ts; src/i18n/practice.ts; src/lib/__tests__/{practiceBooking.test.ts,practiceTrainingFlow.test.tsx}; native PracticeNotificationsPlugin.kt, PracticePushReceiver.kt, PracticeAlertActivity.kt (also contains PracticeAlertService); this handoff/backup.

## Preview training
- Home button; local practice is explicitly distinct from Send Test Notification.
- ₹100 / Maid / Dishwashing / Flat 001; Accept and Reject; fixed wall-clock 60-second expiry; retry resets checks and identifiers.
- Accepted → Start OTP 1234 → In Progress → Complete OTP 1234 → success → Home.
- Shared InputOTP component, existing Button and Progress controls. Practice details intentionally mirror real booking fields without mounting production ActiveJobCard, whose buttons call real booking routes and OTP services.
- Pure practice reducer never calls Supabase. Fixed OTP has no effect on production OTP paths.
- Eight checklist states distinguish sent, received, native alert, acceptance, both OTP validations, started and completed. Local preview cannot pass notification checks.
- Read-only safety hook checks assigned/accepted/on_the_way/started/in_progress plus unexpired pending offers before every action, via realtime and foreground refresh. Unknown/error blocks practice. No profile auto-heal, worker mutation, token refresh or telemetry writes from this hook.
- English/Hindi/Telugu display resources; no translated protocol IDs.

## Native implementation: SOURCE ONLY / NOT BUILT / NOT DEVICE VERIFIED
- PRACTICE_BOOKING returns before existing MyFirebaseService payload logging, BackendSync heartbeat/boot ping, delivery ACK or live offer routing. Nonpractice behavior is unchanged.
- prepare registers only a random `practice-*` ID/60-second expiry in a separate preferences store; rejects local busy/offer and notification permission denial. Receiver accepts only that same, unexpired, nonterminal prepared session.
- Separate PracticeAlertActivity/Service reuse R.layout.activity_booking_alert and R.raw.new_loud_ringtone. Local outcomes only; no RPC, worker busy mutation, queue mutation, real booking or payment routes. OfferQueue is READ ONLY for suppression.
- Optional system overlay if already permitted; otherwise notification tray tap. No USE_FULL_SCREEN_INTENT, no mandatory overlay permission, no new location permissions.
- Native expiry, local busy/live offer checking, cancellation, player release and vibration stop. Native evidence is kept separately from production delivery events.
- Cold process death DOES NOT currently restore the JS accepted practice journey from native preferences. Do not enable push until restoration and logout/session binding are implemented and tested. Force-stopped app delivery cannot be promised by FCM.
- Android service start limits, missing overlay permissions, suppressed channels, device audio/vibration and foreground/background/closed behavior require actual build/device checks. XML parse is not Kotlin compilation.

## Separate notification sender — blocked / requires explicit approval
No accessible Firebase Messaging connector was found; nothing was linked or requested in chat. Existing production sender must NOT be reused blindly, since it may write production health/dispatch telemetry.

Before enabling push:
1. Approve a dedicated server sender `send-practice-notification`; confirm credentials via existing secure connection/settings, not frontend or chat. Use a Firebase Messaging connector if applicable; never store private credentials in code.
2. Verify Supabase login server-side; derive worker by workers.user_id=auth.uid()::text, with existing verified legacy identity fallback only. Refuse missing/ambiguous identity. Never accept a supplied worker ID/token/target.
3. Query own workers.fcm_token, active status and token platform; refuse missing/invalid/non-Android token. Check all real active booking states and pending unexpired offers; fail closed on errors. Read only; DO NOT update worker token health, availability, ranking or production telemetry even on FCM failures.
4. Validate `{practice_id: 'practice-'+UUID, expires_at: milliseconds}` with <=60s remaining. Target own token only. Use data-only `{type:'PRACTICE_BOOKING',practice_id,expires_at}` and Android high priority/TTL <=60s. No booking IDs, customers, offers, OTP or price inputs. Send no top-level notification block.
5. Return `{sent:true,practice_id}` only after provider acceptance. Surface actual HTTP status/error body to caller, never claim receipt. Consider scoped idempotency for network retries before enabling (no automatic resend in current client).
6. Finish native cold-start restoration/session binding. Recheck server safety plus native local safety; verify all failure paths and no production writes.
7. Native build/device verification, then separately approve flipping PRACTICE_PUSH_ENABLED. No auto deploy/publish/release.

## Verification
All existing tests plus new concrete state/OTP/expiry/receipt/safety tests run with bun run test. Browser checks use guest view ONLY because external unmanaged Supabase cannot supply an authenticated session. Browser checked Home entry, send approval message, Reject, retry, Accept, wrong/correct Start OTP, wrong/correct Complete OTP, all eight checks, completion, Home return, elapsed-time expiry, 393x805 and 1280x1800 layouts. No runtime errors or horizontal mobile overflow; no booking/payment writes observed (ordinary app-wide lookup RPCs occur). Production record invariance has NOT been proven in an authenticated/device flow.

## Undo
Restore the eight files from the checksum-verified backup; remove the new practice-only modules/native classes/tests. No database rollback required since none changed. Do not deploy any backend as part of undo.
