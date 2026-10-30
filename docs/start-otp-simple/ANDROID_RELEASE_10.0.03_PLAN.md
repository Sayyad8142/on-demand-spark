# Worker App Android 10.0.03 (build 103): Start OTP release plan

Status: PREPARED, NOT BUILT, NOT RELEASED. Start OTP switch OFF. No DB changes.

## Version
- android/app/build.gradle: versionCode 103, versionName "10.0.03" (was 102 / 10.0.02)
- src/config/version.ts matches.
- The APK bundles `dist/` (capacitor webDir, no server url), so the Start screen ships only inside a new APK.
- The APK was NOT built: the sandbox has no Java/Gradle/Android SDK. NOT VERIFIED.

## Build steps (local machine)
1. Pull latest code. Run `npm install`, then `npm run build`, then `npx cap sync android`.
2. Android Studio: Build > Generate Signed Bundle (release keystore), then upload to the Play **internal testing** track only.
3. Check: unzip the AAB/APK and confirm `assets/public/` contains the Start OTP strings ("Tries left").

## Security review (SOURCE, live DB function text)
- verify_start_otp: worker comes from auth.uid(). Returns NOT_ASSIGNED unless bookings.worker_id is that worker, and CODE_UNAVAILABLE unless the code was issued for that worker. Applies max_attempts (5) with a lock, min_seconds_between_attempts (3, TOO_FAST) and expires_at (EXPIRED). Sets status to started itself. PASS (source).
- start_otp_bookings_guard (BEFORE UPDATE): on flagged bookings, any move to "started" needs a verified code for the current worker. A move to "completed" from a non-started status is refused unless the caller is an admin. Workers can't change the flag. Direct updates can't bypass it. PASS (source). NOT exercised live.
- Reassignment: start_otp_issue_on_assign reissues the code for the new worker, and the old code fails the issued_for_worker_id check. PASS (source).
- Live complete-booking-with-otp source: NOT RETRIEVABLE. It must accept status "started" for flagged bookings. NOT VERIFIED (blocker).

## Tests
229/229 pass (224 existing + 5 new in startOtpCompat.test.ts).

## Supervised spare-phone test (needs approval: creates test bookings)
1. Install the build 103 internal-test APK on a spare phone and log in as a test worker.
2. Turn on Start OTP for test accounts only (needs a separate approved DB change).
3. The spare customer books, and the booking is assigned to the test worker.
4. Check that the card shows only "Start with OTP" and that Complete is blocked.
5. Wrong code: "Tries left: 4". A quick retry gets TOO_FAST. The 5th wrong code locks it.
6. On a fresh booking, the correct code moves it to started, and "Complete with OTP" works with the End code.
7. Reassign before start: the old code is refused.
8. Unflagged booking: the legacy Complete flow is unchanged.
9. Turn the test switch off.

## Update management (prepared, NOT applied)
Current app_update_configs row (worker/android): is_active=false, latest 6.0.66 build 1, min_build 1, mode soft. Stale.

Proposed sequence, once build 103 is live on Play Production:
- Step U1 (soft): latest_version='10.0.03', latest_build=103, min_build=1, mode='soft', is_active=true. Workers get a dismissable prompt.
- Step U2 (force, needs separate GO): min_build=103, mode='force'. The app already defers force while a booking is active, so no job is interrupted.
- Turn Start OTP on only after most active workers report app_version 10.0.03. Workers on older builds would hit the server refusal and be unable to start flagged jobs.

## Remaining risks
- APK not built or verified here.
- Live End OTP edge function unverified.
- Firebase-session auth.uid() inside verify_start_otp has never been exercised live.
- 13 workers are on builds of 7.0.4 or older.

## Update 2026-10-30 (prompt 42)
- Live complete-booking-with-otp source: NOT RETRIEVABLE from here (no Supabase management access token). Project copy: COMPLETABLE_STATUSES = assigned, accepted, on_the_way, started.
- Manual retrieval: Supabase dashboard > project paywwbuqycovjopryele > Edge Functions > complete-booking-with-otp > Code tab (or run `supabase functions download complete-booking-with-otp --project-ref paywwbuqycovjopryele` while logged in). Search for COMPLETABLE_STATUSES and confirm "started" is in the list.
- Web build test (to /tmp, not the project): verify_start_otp and "Tries left" are present in the bundled assets that `npx cap sync` copies into the APK.

### Internal test checklist
- [ ] The installed app shows version 10.0.03 (103) in Profile.
- [ ] Unmarked booking: Complete with OTP works as before.
- [ ] (Needs GO: test-only switch) Marked booking: only Start shows. Wrong code shows tries left, a fast retry is blocked, 5 wrong codes lock it, the correct code starts the job, then Complete works.
- [ ] Reassign before start: the old code is refused.
- [ ] Login, availability toggle, booking alerts and payouts screen are unchanged.
