# Bank passbook scanning

- Passbook OCR uses bundled ML Kit through `PassbookScanner` on Android and lazy Tesseract in browsers; images stay local, camera cache is deleted, and no OCR result is stored or logged. Why: bank photos must not reach paid/cloud OCR or permanent app storage.
- `passbookText.ts` accepts only unambiguous labelled values; forms preserve manually typed values and always clear account confirmation after extraction; submission remains `submit_my_bank_details`. Why: OCR must never guess missing data, bypass manual confirmation or authorize verification/bookings/payouts.