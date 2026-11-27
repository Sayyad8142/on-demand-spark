# Bank Details completion — Prompt 152

## Completed in source
- Upload Bank Passbook, Take Photo and Upload from Gallery share the same scanner on Bank Details **and now signup**. Signup previously had manual fields only.
- Android already uses bundled Google ML Kit Latin text recognition, registered in MainActivity; browser OCR uses lazy Tesseract. No recurring OCR API charges; images are processed locally, not uploaded.
- Extracted holder, account number, IFSC and bank name populate empty form fields only; manually entered values win. Ambiguous fields stay blank. Account confirmation always remains blank and must be typed; all values remain editable before submission.
- Scanning cannot overlap bank saving, and signup cannot continue/change step while scanning. New signup keeps the existing server registration flow after phone verification; existing worker saves use `submit_my_bank_details` with exact deployed parameters and no worker ID.
- Replaced signup's misleading “required for bookings” bank copy with a payment reminder. Registration still requires bank fields because the live Admin registration contract requires them; no registration/payout rule was changed.
- Shared account-keyed status drives Profile/Home. A server submission response updates that cache and triggers readback; foreground refresh picks up verification changes. Pending remains a verification reminder; verified hides the reminder; failed offers correction. These are display-only.

## VERIFIED this turn
- `bun run test`: **1,099 tests, 109 files passed**. Includes new signup OCR/manual-confirmation tests, save/scan exclusion, and shared status refresh/account isolation tests.
- Real signed-out signup browser flow using a synthetic passbook: gallery chooser → actual local OCR → editable correction → mandatory manual confirmation → masked confirmation screen. English/Hindi/Telugu, phone-sized and desktop views inspected. No photo upload, stored bank values, OTP send or worker creation.
- Isolated actual Bank Details screen, with simulated Admin responses and real local OCR: exact submission parameters, pending masked readback, failed correction, rate-limit refusal, locked and verified states; no page errors or photo uploads. **This is not a live authenticated submission.**
- Read-only live database inspection confirmed `get_my_bank_details`, exact five-parameter `submit_my_bank_details`, session-derived identity and Admin validation/duplicate/lock/five-per-24h checks. Live `_bank_gate_on()` still returns false. No live bank row or database mutation.
- Automated bank-independent work checks pass: missing/unknown bank status does not block work even if an Admin bank flag is on. Independent approval, availability slots, offer/acceptance and OTP protections remain unchanged. **No real booking received/completed during this check.**
- Preview reports build OK; `use-mobile.tsx` already imports React hooks explicitly, and its regression test passes. The quoted TS2686 diagnostic was not reproduced; no speculative hook edit.

## NOT VERIFIED / remaining checks
1. Real existing worker: own login → camera/gallery → review → submit → live readback → Profile/Home status update. Cannot run here: this user-managed backend does not provide an authenticated worker session to the sandbox.
2. Real new worker: signup scan → phone OTP → live `register_worker_v2` → bank status readback. Same session limitation; no synthetic phone was sent an OTP.
3. Physical Android: camera/gallery permissions and cancellation, rotation/EXIF, low memory, local ML Kit recognition, cache deletion after success/cancel/process restart, background/resume, and manual correction/submission. Native source wiring was reviewed, but no new Android compilation, APK or physical-device test was performed this turn.
4. Real bank-missing worker receiving, accepting, starting and completing an approved test booking. Automated/source checks and live gate inspection are not device/dispatch proof.

For phone testing, update the local project from the connected repository, build current web assets, then run `npx cap sync android` before building/installing locally; do not publish or increase the version. Review Lovable's native-app guide: https://lovable.dev/blog/native-mobile-apps

## Unchanged
Payout logic and records, bank verification authority, Admin backend, production settings, booking/dispatch/OTP behavior and app version. Nothing deployed or published.