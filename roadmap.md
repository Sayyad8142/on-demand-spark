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
