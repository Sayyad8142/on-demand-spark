# Worker language translation

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
