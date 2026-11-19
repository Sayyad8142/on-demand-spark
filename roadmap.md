# Worker language translation

## Prompt 113 — test sender preparation and repeated hook diagnostic
- [x] Read attached preparation-only request; review sender, native alert, OTP/evidence paths and activation instructions. No deployment or delivery authorised.
- [x] Current hook has explicit React imports; fresh preview build OK, mobile auth screenshot checked, zero page errors/overlays. All 732 tests pass; authenticated Android flow remains unverified.
- [x] Corrected stale checklist JWT/global-switch instructions; activation handoff in docs/practice-activation-preparation-2026-11-19.md. No deployment, send or switch changes.
- [ ] Controlled Android delivery — blocked: named worker/phone, hosted source/configuration verification, approved Firebase transport, separate deployment/delivery approval and signed test APK/device.

## Test Booking send repair — 19 Nov (no deployment/delivery activation)
- [x] Try Again repeats chosen mode with fresh practice id, tap lock and fresh safety check; unknown-send waiting preserved. 87 focused / 732 full tests pass; mobile local practice uses 1234 twice, retry reopens alert, no page errors.
- [x] Hosted sender returns 503 approval_required; no function logs returned. Isolated staged sender/native token/receipt/alert boundaries reviewed; report docs/practice-send-repair-2026-11-19.md.
- [ ] Enable and physically verify FCM — blocked by separate deployment/delivery approval, selected pilot login/device hash/config verification, current Android bundle and real phone. No production switch or backend change.

## Foreground service permissions — 19 Nov (104, no publication)
- [x] Follow-up cross-app source sweep checked reminder manager/escalation, availability/flat/cancellation speech, boot and WorkManager jobs, practice and all plugin manifests; no additional Health/Media Playback permission origin found. Keep decision preserved; no audio/OTP redesign authorised.
- [x] User chose to keep existing step tracking/Health permission pending a separate replacement; no heartbeat or tracking changes authorised.
- [x] App and all eight installed Capacitor plugin manifests audited; both permissions originate in app manifest, not plugin source. Media Playback retained for continuous Start OTP; official Play user-initiation requirement documented as unresolved.
- [ ] Final merged manifest/release AAB verification — blocked by missing production dist, JDK/SDK/signing; provide exact local checks without claiming readiness.

## Android release blocker review — 19 Nov (104, no publishing)
- [x] Swept shell/npm/Windows/CI/Android Studio/direct Gradle packaging paths; added missing CI and Gradle bundle checks and stale-extra-file refusal; OTA left unchanged/outside this release request.
- [x] Reconfirmed Vite's production output defaults to Capacitor webDir dist; dependencies already installed. No source build failure was established: this workspace prohibits manual project builds and does not expose dist.
- [x] Re-ran all 728 frontend tests and isolated PostgreSQL approval assertions; version/release guard against user-reported 102 passes. Firebase package matches; identity/signing/backend untouched.
- [x] Added final Windows Android Studio build, sync, signing and AAB verification instructions in docs/play-release-104-2026-11-19.md.
- [ ] Production web build and Capacitor sync — blocked by workspace build restriction; do not sync stale or missing dist.
- [ ] Approval enforcement deployment — blocked by separate approval and hosted sender/concurrency verification; required before claiming mandatory approval is release-safe.
- [ ] Signed verified AAB and phone upgrade tests — blocked by missing JDK 21/Android SDK/upload key/device; no AAB generated or published.

## Finalize Android 10.0.04 (104) — 18 Nov
- [x] Keep 10.0.04/104; user reports checked production 10.0.02/102. All-track upload history is not independently verified.
- [x] Attempted cap sync (failed: no dist); strengthened asset checker with current notification/approval/OTP markers and byte parity, covered by four tests.
- [x] Fresh hosted approval audit; six-function policy-preserving SQL patch/backups staged under docs/play-finalize-104-2026-11-18/approval; isolated PostgreSQL suite passed. No production deployment.
- [x] Package/Firebase/signing/notification source audit; 728 frontend tests passed; preview build OK; final report in docs/play-finalize-104-2026-11-18/FINAL-READINESS.md.
- [ ] Actual production build/Android sync — blocked: manual project builds unavailable here and no exposed dist output; exact local npm run build + cap sync steps provided.
- [ ] Hosted approval deployment/full dispatch coverage — blocked: separate deployment approval, remaining sender/concurrency/real-worker verification.
- [ ] Signed AAB/native/device flow — blocked: JDK/SDK/Kotlin/upload key and phone/session unavailable; all-track code uniqueness/policy review and publication approval still required.

## Google Play 10.0.04 release preparation (18 Nov) — no publication
- [x] User skipped Play history confirmation; prepare 10.0.04 (104) provisionally with upload blocked until highest uploaded code is confirmed lower than 104.
- [x] Audit package/version/signing/Gradle and make Profile display the actual installed version name plus build; enforce explicit uploaded-build input in release checks.
- [x] 724 tests passed; preview build OK; Profile version verified at 393/734/1280px; release guard rejects reused/unknown builds. Stale Android bundle detected; report in docs/play-release-10.0.04-2026-11-18.md.
- [ ] Upload-history confirmation — blocked: Play Console history unavailable; 104 provisional after skipped question.
- [ ] Signed AAB and device/hosted flow verification — blocked: stale packaged web assets, no local JDK/SDK/upload key, external worker session/physical phone unavailable, prior backend approval gap and separate publication approval. No deployment/force-update activation.

## Start Booking button redesign (18 Nov) — preview only
- [x] Remove visible countdown, play icon and separate warning; reuse the unchanged deadline for a green/red Start OTP button with a reduced-motion-safe pulse.
- [x] 62 OTP/reminder regressions passed; isolated actual-card browser checks passed at 320/393/480/1280px in English/Hindi/Telugu for normal/delayed/started/cancelled states; reduced motion stops the pulse. Preview build OK; reported hook error absent.
- [ ] Real signed-in OTP flow and installed Android check — blocked: external unmanaged worker session and physical phone unavailable. No publication or backend/native alarm changes.

## Prompt 112 — remove Next Booking from app
- [x] Remove Next Booking from ranking navigation, swipe destinations and rendered screen; preserve Top Workers/Top Earners and all booking behavior.
- [x] 68 regression tests pass; preview build OK; mobile/desktop guest ranking has two working tabs, zero Next Booking requests, no overflow/page errors. No backend changes or publication; signed-in ranking data not verified.

## Prompt 111 — Next Booking activation readiness (no activation/deployment)
- [x] Audit Android OFF gate, hosted 401/CORS, live eligibility/approval definitions, uniform-ranking settings and missing bundled endpoint markers.
- [x] Hide contradictory numeric queue positions for excluded workers; 65 focused / 710 full app tests and 29 staged-alternative tests pass; preview build OK.
- [x] Report NO-GO and backend/device approval gates in docs/live-next-booking-2026-11-12/PROMPT-111-ACTIVATION-READINESS.md; integration stays OFF.
- [ ] Authenticated hosted scenario/dispatch parity and installed APK checks — blocked: hosted source/version, external worker session, isolated backend/device and separate activation/deployment approval.

## Mandatory Admin approval (18 Nov) — not published
- [x] Decision: existing workers keep working until Admin reviews each one; new signups wait for approval.
- [x] On/off switch locked with waiting message for pending/rejected/suspended; re-checks at tap time; approval picked up live and on app return. Approval never turns ON automatically.
- [x] Shared database already forces new signups to pending and refuses ON until approved (legacy exemption for existing workers). 701 tests pass, build OK.
- [ ] Signed-in/phone check of Signup → Approve → ON → booking — blocked: no worker session for this project's sign-in; publishing awaits confirmation.

## Next Booking audit (18 Nov) — no deployment/publication
- [x] Trace the explicit Android/production OFF gate and current worker-next-booking reader; hosted unauthenticated POST returns 401, CORS OPTIONS returns 200. Reported src/routes/__root.tsx is absent.
- [x] Add manual refresh for successful snapshots/unavailable service and reject stale snapshots or unsupported services without inventing queue positions.
- [x] 51 ranking tests pass; preview build OK; mobile /leaderboard redirects to rendered /auth without page errors. Audit in docs/live-next-booking-2026-11-12/AUDIT-2026-11-18.md.
- [ ] Verify real queue against hosted dispatcher and activate Android — blocked: hosted ranking/dispatcher source, authenticated external-worker scenarios, separate activation approval and installed APK/device access.

## Android notification repair (17 Nov) — no deployment/publication
- [x] Sweep sibling permission/registration screens and background jobs; fix Device Readiness/Settings native readback/resume, browser-only routing, unknown permission and failed boot-repair reporting. 694 tests pass; source-only server findings and unchanged release gates in FLOW-SWEEP.md.
- [x] Correct stale permission warnings, native Settings return checks and Retry registration/readback; preserve dispatch, deadlines and OTP.
- [x] 689 tests pass; preview build OK and mobile auth screen has no errors; Firebase package/configuration traced; APK rebuild guide in docs/android-notification-fix-2026-11-17/REPORT.md. Native compilation blocked: no Java/Android toolchain; packaged assets require local rebuild + sync.
- [ ] Verify installed APK permission, FCM delivery and acceptance foreground/background/locked — blocked: physical Android phone and approved booking required.

## Prompt 107 — Home leaderboard card removal
- [x] Remove only the Home leaderboard card and its unused imports; preserve the dedicated ranking page, other Home elements and all server data.
- [x] Mobile guest Home verified at 393×805: card absent, bottom navigation intact, no overflow or page errors; 38 regression tests pass, preview build OK. Reported hook error not reproduced; explicit React imports already present. Signed-in checks unavailable for external unmanaged authentication.

## Prompt 102 — conditional real-ranking activation
- [x] Record approval to enable read-only UI only after authenticated verification succeeds; keep all unrelated features unchanged.
- [x] Fresh 45 ranking tests pass; preview build OK at 01:33:26 UTC; mobile preview redirects to auth with no page errors/error overlay. Reported use-mobile error not reproduced; explicit React imports already present.
- [ ] Verify the existing endpoint contract with the current worker and enable only on success — blocked: external_unmanaged auth has no injected worker session; the session-aware function tool POST returned 401 unauthorized, not authenticated ranking data. Actual success response/parameters remain unverified; UI stays OFF. No backend deployment or publication.

## Prompt 101 — existing Next Booking function correction
- [x] Correct the client function name to worker-next-booking without activation; hosted invalid-token POST responds 401 unauthorized (not 404).
- [x] Reported mobile hook error not reproduced: explicit React imports, preview build OK, mobile auth page has no error overlay/page errors; 45 ranking regression tests passed.
- [ ] Verify hosted request/response compatibility and real worker ranking — blocked: authenticated external-worker testing and hosted source unavailable; live activation remains unapproved and OFF. See PROMPT-101-CORRECTION.md.

## Prompt 100 — Next Booking backend connection
- [x] Confirm configured production project and exact intended function; repeat hosted probe returns 404 NOT_FOUND; locate existing staged package without changing its algorithm.
- [x] Fresh Deno compilation and 29 isolated security tests passed; exact endpoint and remaining deployment/activation gates recorded in PROMPT-100-CONNECTION.md.
- [ ] Connect and verify real ranking — blocked: separate deployment and activation approval required; authenticated unmanaged-worker testing unavailable.

## Next Booking connection fix (15 Nov)
- [x] Identify disabled integration and hosted endpoint 404; preserve activation approval gate.
- [x] Implement explicit unavailable/session/connection states, session refresh, Retry, IST display and remove duplicated explanation.
- [x] 667 app tests passed; preview build OK; 393×805 and 1280×1800 guest checks verified explicit disabled state, single explanation, tab switching and no overflow/page errors.
- [ ] Verify real eligible/ineligible worker ranking — blocked: endpoint returns NOT_FOUND, production activation not approved, external unmanaged authenticated checks unavailable.

## Current Worker App rating fixes (15 Nov) — no deployment/publication
- [x] Share server rating/count reads; refresh on open, foreground, customer updates and completion.
- [x] Paginate completed-only reviews and prevent early feedback retrieval in Worker App screens; history ratings refresh independently of rankings.
- [x] Stage exact database privacy/ownership restrictions and release handoff in docs/rating-fixes-2026-11-15.
- [x] 656 app tests passed (15 new rating tests); mobile/desktop public/guest preview checks passed, no runtime errors.
- [ ] Apply database privacy enforcement — blocked: separate deployment approval and User App/ranking compatibility verification.
- [ ] Verify authenticated rating-to-OTP flow and physical-phone release — blocked: external unmanaged session, latest User App access and isolated device unavailable.

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
- [x] Prompt 99: prepare five approved preview-only corrections + native own-offer preflight; 627 frontend, 52 Android, 29 + 104 Deno, 148 priority, 40 handler and 34 isolated SQL tests passed; preview build OK. Report and Admin Panel contract handoff prepared; generated Android packages removed.
- [ ] Prompt 99: coordinate final contract with Admin Panel before release — blocked: Admin Panel confirmation and real Android phone verification.
- [ ] Backend fixes B1–B7 — owned by Admin Panel/backend; awaiting approval and hosted source parity.
- [ ] Real Android phone tests — blocked: device and approved test bookings not supplied.

## Start OTP voice reminder audit (14 Nov) — read-only
- [x] Trace source/local audio/backend metadata; run 34 existing safety tests; inspect aggregate production evidence without OTPs or tokens.
- [x] Report nominal 23-slot timeline, reboot replay, stale cancellation/audio/idle limitations and distinct completion reminders; reported root file absent, public preview renders without page errors.
- [ ] Establish real-phone audible playback/stop reliability and hosted sender parity — blocked: physical device/installed APK evidence and authoritative hosted source unavailable; no changes or notifications approved.

## Start OTP native continuous alarm (15 Nov) — implementation approved, no release/deployment
- [x] Replace cutoff schedule with 10/15-minute clips and continuous alarm from 20 minutes.
- [x] Implement native single-player lifecycle, server-state reconciliation, restart/account cleanup and five-minute temporary silence; boot restoration requires fresh state/user opening under Android restrictions.
- [x] 641 app tests, final 53 targeted tests, Android Kotlin/Java compilation and 66 native tests passed; preview build OK, generated Android packages removed. Details in docs/start-otp-alarm-2026-11-15/IMPLEMENTATION.md.
- [ ] Verify actual audio/timing/stops on isolated phone — blocked: physical phone/approved test booking unavailable; background/exact-alarm permissions, boot/force-stop and expired-session behavior need device verification. No production deploy/release approved.

## Prompt 103 — authenticated Next Booking verification (preview only)
- [x] Read-only Next Booking turned on only on the preview site (never published site, custom domain or Android app); uses the worker's own login and `worker-next-booking`.
- [x] Temporary safe preview check: signed in, server answer, valid ranking data, short error code, field names and numbers only (no names, phones, ids or tokens). 48 ranking tests pass.
- [x] Real response seen (HTTP 200, areas list); screen now reads it per community/service; temporary check panel removed.
- [ ] See Next Group / In Line with a real number — waits on a worker who is in the line (current test worker: notifications off).

## Priority score display fixes (15 Nov) — frontend only
- [x] Profile breakdown reads server score parts; Home community card honest pointer; Leaderboard own score from own row, "—" for no reviews; wording no longer claims score decides bookings; Next Booking marked unconfirmed estimate. 675 tests pass.
- [ ] Leaderboard server 0→50 / rating→5.0 fallback — staged in docs/priority-score-fixes-2026-11-15/BACKEND-PENDING.md, awaiting deploy approval.
