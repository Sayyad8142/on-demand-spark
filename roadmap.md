# Worker language translation

## Next Booking placeholder (12 Nov) — preview only
- [x] Audit and checksum-backup affected files; preserve shared rating ranking.
- [x] Replace page tab with local translated placeholder; neutralize unsupported priority claims without changing scores.
- [x] Verified 572 tests and preview build; isolated mobile/desktop English/Hindi/Telugu checks passed. Live authenticated check unavailable (external unmanaged auth); no deployment or live data activation.

## Repeat booking alerts (11 Nov) — preview only
- [x] Read requirements and create checksum-verified source backup.
- [x] Audit cancellation/busy guard, repeat presentation, expiry and duplicate lifecycle; distinct offer receipt verified, phone cause remains unconfirmed.
- [x] Prepare native cleanup/reuse/replay fix; 501 frontend + 24 native tests passed, TypeScript and Android Kotlin/Java compilation passed; generated output removed.
- [x] Report evidence and isolated real-phone checklist in docs/repeat-booking-alerts-2026-11-11/REPORT.md; no live actions/deployment.
- [ ] Verify repeated alert display/actions/audio/ACK on isolated Android phone — blocked: no device/isolated services or live receiver source supplied.

## Signup Step 2
- [x] Simplify payout selection into visual QR-upload and manual UPI choices; preserve existing validation and bank fallback.
- [x] Check reported utils error (not reproduced; current file has six lines and app build is OK); verify manual entry, QR decoding, confirmation and Hindi/Telugu choices in the preview; 54 tests passed; not published.

- [x] Audit worker screens and display-only language gaps.
- [x] Centralize translated display text, service labels and persistent language handling.
- [x] Translate worker forms, bookings, earnings, profile, settings and shared dialogs (web presentation).
- [x] Verify three-language signup switching and browser restart persistence; Telugu guest navigation; 54 safety tests passed.
- [x] Produce coverage report and identify native/server limitations; do not publish.
- [ ] Verify authenticated booking/payout workflows and native restart/notifications — blocked by no native Firebase session/device in this sandbox.
## Push acknowledgment recovery
- [x] Root cause: live ack-booking-delivery is an old build accepting only received/opened.
- [x] Stage corrected function + worker_id validation in docs/ack-recovery/staged; 24 offline tests pass.
- [x] Deployment, verification, monitoring and rollback procedure written.
- [ ] Deploy — blocked: owner must confirm backup + settings saved and explicitly approve.
- [ ] Mark 15–17 Oct no_device_ack offers as outage for 14 workers — blocked: needs approval after deploy.
- [ ] Native retry fix for dropped 4xx ACKs — blocked: next app release.
## Notification reliability audit (19 Oct)
- [x] Full audit written: docs/notification-reliability-audit-2026-10-19.md — pipeline, all 11 ACK call sites, live event table (device ACKs stop 14 Oct 13:17 UTC), popup behavior, Android/iOS scope, A–F verdict = D (backend rejects 400, client drops silently).
- [ ] Deploy corrected ack-booking-delivery — blocked: explicit owner approval (CRITICAL-1).
- [ ] Reject core fix — blocked: explicit owner approval (CRITICAL-2, docs/reject-fix/).
- [ ] Next release: stop silently dropping terminal 4xx ACKs + popup Retry on failed reject (HIGH-1, §4).
## Fix confirmed review problems (7 Nov)
- [x] 2 Private values removed from logs (TS + Android)
- [x] 3 Community fee instead of 20% (estimates + completion screen)
- [x] 4 One shared accept lock (in-app + pop-up); offer kept open on network errors
- [x] 5 Pop-up failure → in-app alert + backup notification
- [x] 6 Movement checks stop on booking end/logout; boot location service removed
- [x] 7 Notification health detects phone/server token mismatch
- [x] 8 Ringtone, heartbeat/poller listener and push-start leaks fixed; ActiveJobCard hooks crash fixed
- [x] 9 Offer checks reduced to realtime + FCM + one backup poller
- [x] 10 Unused files and phone-number scripts deleted; test-booking tool dev-only
- [x] 12 Tests: 27 files / 322 pass; 8 offline Deno + 15 DB rehearsal checks pass
- [ ] 1 Lock down send-fcm/send-webpush — all callers mapped (2 functions + 2 DB triggers use public key), staged fixes + 17 offline tests + trigger rehearsal; blocked: owner GO
- [ ] 11 Database policies — staged + rehearsed; blocked: owner + User/Admin app approval
- [ ] Native build + phone checks — blocked: no Android build tools here
- [~] Type shortcuts: 22 native-bridge casts replaced by one typed definition (103→76 `as any`); lint 197 pre-existing style errors
- [ ] Hard-coded colours — blocked: swapping to theme colours changes look; needs owner OK on colour mapping
- [x] Payout display fixes (statuses, IST totals, pagination, live refresh, receipt text, en/hi/te).
- [x] Connect hybrid payout cards to contract v1 (switched off). Blocked to turn on: server functions not live; signed-in worker test.
- [ ] Worker account-linkage DB fix — blocked: Admin Panel review + deployment dependencies (docs/security-fixes-2026-11-10/worker-linkage/HANDOFF.md).
## Availability screen: simple words + voice help (11 Nov)
- [x] New labels (en/hi/te), bigger day buttons; save/load unchanged (screen test checks identical save data).
- [x] Speaker button beside heading and welcome note; app language, female voice where available, English fallback, no overlap, stops on leave.
- [ ] Hear it on a real Android/iPhone — needs a new native build (voice add-on); older installs use browser speech or show "voice not available".
## Update system fixes (11 Nov) — preview only, nothing published, forced updates stay off
- [x] 1 OTA: never during offer/booking/OTP, wait for booking load, SHA-256 required, HTTPS allow-list, safe ZIP, failed-bundle memory, delivery switched off
- [x] 2 Real installed version/build/platform in heartbeat, FCM sync, delivery receipts; local version history
- [x] 3 Heartbeat: app stops sending worker id; phone sends login; staged server guard (observe → enforce) + tests
- [x] 4 Update prompts deferred for every active-work step incl. in_progress and OTP screens
- [x] 5 Notification reliability review (token re-registration, channels, permissions)
- [x] 6 Staged observe-only outdated-build monitoring (SQL + rehearsal)
- [x] 7 Release AAB script, signing from outside the repo, version/SDK check
- [x] 8 Startup/crash + update event recording (local), en/hi/te messages
- [x] 9 Tests + final report
- [ ] Device test of OTA install/rollback + signed AAB build — needs Android SDK/phone (not in this workspace)
- [ ] Apply staged SQL + heartbeat guard — needs owner approval

## Preview-only Test Booking training (11 Nov)
- [x] Audit existing flow and verify backup checksums before edits.
- [x] Implement isolated preview training, OTP stages, timeout, checklist, Home entry and disable unsafe developer tool.
- [x] Prepare separate native receiver/alert and approval-gated notification service handoff; no deployment.
- [x] Run regression and training tests; verify browser practice flow.
- [ ] Complete real FCM sender + cold-start/session binding + device checks — blocked: sender approval/connection and new Android build/device; push stays OFF.

## Test notification sender — audit and preparation only (11 Nov)
- [x] Prepare isolated sender core under docs and 25 sender-specific offline tests after checksum-verified backup; all 467 tests pass.
- [x] Report security protections, delivery evidence and Android blockers in sender/AUDIT.md; no runtime/native changes, deployment or sending.
- [x] Implement approved sender/journal adapters (staged) and native session/cold-start/dedupe/preemption (source); 495 tests pass; device checklist written.
- [ ] Apply journal SQL + deploy sender + enable switch — blocked: owner approval.
- [ ] Android compile + device checklist — blocked: signed build and test phone (no Android tools here).

## Test Booking entry and APK readiness (11 Nov)
- [x] Move Test Booking from Home into Profile's Account Actions; keep practice-page real-work checks and notification switches unchanged.
- [x] Verify relocated entry and local training in mobile guest preview; 73 practice tests pass, build OK, no browser runtime errors. Real push remains OFF; approval, staged journal/sender activation and Android compile/device checks still required; authenticated testing unavailable for external Supabase.

## Approved booking-alert continuation (prompt 85) — preview/test only
- [x] Compile Android: debug build successful, generated plugin paths corrected; version unchanged, no APK published; oversized generated outputs removed.
- [x] Implement foreground Activity path, supported background notification fallback, fixed server deadline, visible-only acknowledgments and shared sound/vibration/dedupe; native visual/interaction verification remains device-blocked.
- [x] Investigate 10.0.02 HTTP 401 via source/prior evidence only; exact live root cause blocked by missing receiver download and installed APK comparison.
- [x] All 501 existing tests + 8 native tests passed; TypeScript check passed; results in docs/booking-alerts-audit-2026-11-11/PROMPT-85-RESULTS.md.
- [ ] Real Android device verification — blocked: test phone/emulator; only isolated test bookings allowed.

## Prompt 86 — repeat-alert final verification
- [x] Completed booking releases phone alert lock (new fix) + tests
- [x] All automated tests + Android compile
- [ ] Real-phone consecutive-offer checks — blocked: test phone needed

## Test notification fix (12 Nov) — preview/staged only
- [x] Read phone report and verify 19-file checksum backup; keep live sending OFF.
- [x] Add single-account/device pilot gate and custom durable send limit; stage only.
- [x] Fix uncertain-send evidence, retry, foreground practice alert and visible-only evidence.
- [x] 519 app + 33 native tests pass; Android compile successful; 8 local SQL assertions pass; report/phone checklist prepared.
- [ ] Controlled FCM-to-phone practice completion — blocked: separate deployment/sending approval, approved account/device and real Android phone.

## Prompt 87 — controlled-test readiness review
- [x] Review sender/native isolation, rerun 519 app tests, check prior 33 native-test/compile evidence and live prerequisites read-only.
- [x] Record NO-GO blockers and exact proposed deployment/switch sequence in sender/PROMPT-87-READINESS.md; no activation.
- [ ] Activate one-device test — blocked: sender packaging/transport/auth review, native race checks, explicit worker/device selection and separate approval.

## Prompt 88 — fix Test Booking notification blockers (preview/staged only)
- [x] Verified 68-file backup; self-contained sender package, validate-only transport mode, CORS, in-code auth config.
- [x] Practice log admin access + 30-day retention; local SQL rehearsal passes.
- [x] Phone: device-fingerprint binding, 30 s freshness, logout/late-reply/page-reopen races fixed.
- [x] 534 app + 38 native tests pass, Android compile OK, security scan clean for practice; report PROMPT-88-RESULTS.md.
- [ ] Deploy (switch OFF) → validate → one-phone test — blocked: owner approval + named account/phone + real phone.

## Prompt 89 — approved preparation, delivery prohibited
- [x] Check reported hook error: hosted preview succeeded; named React imports already present.
- [x] Preserve verified 73-file source backup under sender/backups/prompt-89; confirm sender previously absent.
- [x] Set server switch explicitly OFF and apply reviewed isolated journal migration.
- [x] Review migration security flags: intentional default-deny table and role-checked admin report; worker isolation unchanged.
- [x] Deploy only the isolated sender; hosted OFF returns 503; validate-mode missing/fake login returns 401; restore OFF.
- [ ] Firebase validate-only transport and authenticated pilot checks — blocked: approved pilot login/device/session not supplied; do not choose another account.
- [x] Verify unchanged non-practice function hash, 534 app + 6 sender + 38 Android tests, compilation and rollback; record partial-PASS report in sender/PROMPT-89-RESULTS.md.
- [ ] Single-phone delivery/APK release — blocked: separate owner approval and real phone; both delivery switches must remain OFF.

## Prompt 94 — preview-only dispatch compatibility
- [x] Preserve FCM deadlines, display fields, schedule and cancellation routing after verified backups.
- [x] Guard native acceptance/retry against the original deadline; review signed ACK compatibility.
- [x] Run app tests (553 pass) and pure Java tests (12 pass); attempt Android checks and report exact blockers.
- [x] Full Android compilation/Robolectric suite — verified during combined fixes: Android compilation and 45 native tests passed.
- [ ] Real-device verification — blocked: isolated Android device/services unavailable; no production actions approved.

## Combined worker fixes (12 Nov) — preview/staged only
- [x] Inspect relevant source, read live Start OTP verifier, verify file backups.
- [x] Remove retry-count display; stage safe unlimited-retry verifier without production changes.
- [x] Shared cached active booking, immediate refresh, separate real charges, 10-minute server-time countdown.
- [x] Integrate optional activity onboarding, safe battery continuation, repair native speech lifecycle.
- [x] Run 571 app / 45 native tests; compile Android; report evidence and remaining limitations.
- [ ] Apply and verify staged unlimited-retry server change — blocked: separate production approval; live cumulative lock remains.
- [ ] Signed-in end-to-end / physical Android checks — blocked: external unmanaged session, unavailable real phone; browser only reached loading screen.

## Live Next Booking — preview preparation (12 Nov)
- [x] Audit source authentication/live schema and RLS; back up files; stage verified-auth independent service with disabled reader.
- [x] Implement translated ranking view and foreground-only refresh; 606 tests and preview build pass; mobile/desktop safe disabled view checked.
- [ ] Activate secure service and verify authenticated live workers — blocked: separate backend/integration approval and authenticated test access.

## Prompt 96 — secure endpoint verification only
- [x] Audit and harden staged authentication, bounded input, SDK CORS, privacy, NULL-status busy exclusion and read timeouts; no deployment.
- [x] Isolated Deno compilation and 29 security tests pass; 38 app ranking tests pass; conditional deployment-only GO documented.

## Prompt 97 — approved ranking endpoint deployment only
- [x] Confirm exact production target and function; rerun Deno check and 29 security tests; verify frontend flag remains OFF and preview diagnostics are clean.
- [x] Read-only endpoint probes returned 404; record unmet pre-deployment safeguards in docs/live-next-booking-2026-11-12/PROMPT-97-STATUS.md.
- [ ] Deploy only worker-availability-ranking — blocked: no management listing/source/configuration backup capability or authoritative managed credential-presence verification available; no function files copied into auto-deploying directory.
- [ ] Verify hosted authentication, community/service isolation, privacy, IST ranking and error handling — blocked: endpoint not deployed; external unmanaged worker session unavailable. Frontend activation and APK publication remain unapproved.

## Prompt 98 — read-only deployment prerequisites
- [x] Check available management tools, attempt authenticated function listing, inspect managed-secret names and rerun staged Deno compilation/security tests; no production changes.
- [ ] Establish authoritative function existence/version and runtime credential presence — blocked: Supabase CLI has no management access token; available gateway tools have no function list/download or runtime-presence read.
- [ ] Reconfirm deployment-only scope after prerequisites are verified — blocked: prerequisites remain unresolved; live ranking stays OFF.

## Dispatch coordination audit (14 Nov) — read-only
- [x] Audit new app (web + native) and live backend contract; report in docs/dispatch-coordination-2026-11-14/REPORT.md.
- [ ] Prompt 99: implement approved preview-only offer generation dedupe, server-owned rejection escalation, own-worker preflight, fixed simulated deadline and error handling; run all existing tests.
- [ ] Prompt 99: coordinate final contract with Admin Panel before release — blocked: Admin Panel confirmation and real Android phone verification.
- [ ] Backend fixes B1–B7 — owned by Admin Panel/backend; awaiting approval and hosted source parity.
- [ ] Real Android phone tests — blocked: device and approved test bookings not supplied.
