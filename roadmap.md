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