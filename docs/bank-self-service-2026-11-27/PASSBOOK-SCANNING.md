# Passbook scanning — preparation only, no publication

## Implementation (SOURCE)
- Existing Bank Details form: Take Photo / Upload from Gallery above manual entry, editable fields, empty account confirmation after extraction, scanning/error/review guidance in English, Hindi and Telugu.
- Android: custom Capacitor 7 `PassbookScanner`, bundled Google ML Kit Latin recognition, external camera or system image picker. Downsample to at most 2400 pixels per side. Camera images live only in a private cache directory and are deleted on completion, cancellation, destruction or next plugin load after process death; gallery originals are never modified/copied into permanent app storage.
- Browser: lazy Tesseract English recognition on a resized in-memory canvas (2000-pixel maximum side, 12 MB input limit), terminated after each scan or leaving the form. The browser downloads OCR software/model files, never uploads the photo. Android recognition requires no model download; handwritten/non-Latin/unclear information is entered manually.
- Extraction accepts explicit labels and readable values only. Ambiguous, masked, damaged or absent fields stay blank. No IFSC lookup or OCR character guessing. User edits already in the form are preserved.
- Reviewed values still go only to Admin-owned `submit_my_bank_details`. The form never sends a photo, scan text or verification flag; OCR does not verify a bank. Existing booking, bank gate, payout and permissions logic is unchanged.

## Validation boundaries
VERIFIED: 24 focused tests and the final full suite of 1,079 tests passed after the save-connection fix. Browser Playwright used the actual form and real Tesseract on a synthetic passbook: all four fields extracted, manual confirmation empty, no photo upload POST, corrected account sent only to a mocked Admin RPC, unavailable save never called success. English/Hindi/Telugu at 393×805 and desktop at 1280×1800 were inspected; no horizontal overflow or page errors. The reported mobile hook error was not reproduced and preview build logs report build OK.

The browser check also found the existing bank RPC lost its Supabase method receiver; `submitMyBankDetails` now binds the client, covered by a receiver regression test. This only repairs reaching the existing Admin endpoint; it changes no server contract or permissions.

Automated tests and isolated preview checks are not proof of physical-camera behavior or authenticated Admin save/readback. A complete installed-Android flow still needs a local test build and phone; real submission needs the Admin bank RPC and worker session. No version increment, app-store upload, publication, backend function change or database permission change is included.

## Local Android test setup (no store publication)
Update your local copy from the connected repository, run `npm install`, `npm run build`, then `npx cap sync android` and run the Android project on a test device. The new plugin and ML Kit dependency cannot reach an already installed Android shell by a web-only update.

Device checklist: clear/rotated/blurred photos; camera and gallery cancellation; scan without network; missing/ambiguous fields; manual corrections and retyping confirmation; low-memory phone; leaving the screen; process death/cache cleanup; denied image access; Admin unavailable and successful own-account submission/readback. Confirm no bank data in logs/network/storage and no verification status change from OCR alone.

Read the [Lovable mobile development guide](https://docs.lovable.dev/tips-tricks/mobile-apps) before local native testing.