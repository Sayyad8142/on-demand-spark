# Final OTP Production Readiness Check — 2026-11-02 (read-only)

Main project: paywwbuqycovjopryele. Nothing deployed, published or changed.

## Task 1 — Live End OTP function
- SOURCE: project copy `COMPLETABLE_STATUSES = ["assigned","accepted","on_the_way","started"]`.
- LIVE: function exists (POST without login → 401). Live source NOT VERIFIED (no Supabase access token in this workspace).
- To verify: Supabase dashboard → Edge Functions → complete-booking-with-otp → Code → download, or run
  `supabase functions download complete-booking-with-otp --project-ref paywwbuqycovjopryele` and send the `index.ts`.
  Check that the status list contains "started". Do not redeploy unless it differs.

## Task 2 — Start OTP path
- Worker App calls DB function `verify_start_otp` directly (no edge function).
- Edge function `verify-start-otp` does NOT exist live (POST → 404). If the User App calls it, that call fails.
  Customer display should use the DB path (service_get_start_otp is service-role only; customer read path per User App).
  ACTION: confirm with the User App which call it really makes for showing the code.
- DB (PRIOR, verified 2026-11-01 from live function source): 4 digits, worker from auth.uid(), 5 attempts
  (config max_attempts=5), 3 s between tries, 720 min expiry, reassign reissues code, guard blocks completion of
  flagged unstarted bookings, started→completed allowed.

## Task 3 — Switch
- LIVE: start_otp_config.enabled=false, 0 flagged, 0 codes. Triggers aab_start_otp_bookings_guard and
  zza_start_otp_issue_on_assign enabled.
- The switch only decides whether NEW assignments get flagged. Enforcement is per booking (start_otp_required).
  Turning OFF does not unflag already-flagged bookings; those still need the Start code (or admin_release_start_otp).

## Task 4 — Android
- android/app/build.gradle: versionCode 103, versionName 10.0.03; web bundle contains verify_start_otp.
- APK build: NOT RUN — no Java/Gradle/Android SDK here. Not ready until built.
- Build locally: `bun install && bun run build && npx cap sync android && cd android && ./gradlew assembleRelease`
  (Java 21). Install on a spare phone, log in as test worker.
- Installed versions: workers.app_version / app build fields (see audit 2026-11-01).
- Older builds: no server-side filter today; they would see only "Complete" and get blocked by the guard.
  Mitigation: force update to 103 before enabling.

## Task 5 — Smoke test (quiet hour, test accounts)
1. Switch ON → assign one test booking → confirm flagged + code row exists.
2. Customer sees 4 digits. 3. Worker sees Start screen. 4. Wrong code → rejected, tries left.
5. Right code → status started. 6. End code completes. 7. Compare wallet/payout/availability rows before/after.
Switch OFF immediately after. Leftover flagged test booking: finish with Start code, or admin_release_start_otp.

## Task 6 — Decision: NO-GO
Blockers: live End function source unverified; User App `verify-start-otp` call 404; APK not built; no forced
update for older builds. Rollback: set enabled=false; release any flagged bookings with admin_release_start_otp.
