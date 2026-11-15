# Next Booking connection fix

## Cause — SOURCE / HOSTED
- SOURCE: `NEXT_BOOKING_LIVE_ENABLED` is false. The hook correctly made no ranking request, but the screen incorrectly labelled all missing data “Unable to Verify”.
- HOSTED: POST `/worker-availability-ranking` with `{}` returned HTTP 404 `NOT_FOUND` on this turn. This proves the request did not reach an available ranking service; it does not verify authentication or eligibility behavior.
- SOURCE: the reported UMD phrase is absent from `use-mobile.tsx`, which already imports React hooks explicitly. Latest preview compilation is build OK; no speculative hook edit was made.

## Implemented — SOURCE / TEST
- Explicit disabled, signed-out/session refusal, missing endpoint, connection and invalid-response states.
- Expiring sessions refresh before requests; a 401 gets at most one immediate refresh/retry. Refreshed sessions must still match the current account.
- Manual Retry for connection/invalid-data failures without bypassing the activation flag; all snapshots remain strict and privacy-safe.
- Server eligibility reasons show distinct working-hours, availability OFF, busy and inactive explanations. No eligibility is inferred when the service is unavailable.
- Removed the duplicate ranking explanation. Slot times explicitly use Asia/Kolkata regardless of device timezone. New messages cover English, Hindi and Telugu.

## Verification
- TEST: 45 targeted ranking tests passed; full app suite 667 passed.
- PREVIEW: latest build OK. Chromium 393×805 and 1280×1800 guest checks verified disabled message, one explanation, no overflow/page errors and other tabs selectable. Screenshots inspected.
- NOT VERIFIED: real eligible/ineligible worker ranking, authenticated end-to-end requests, hosted ranking privacy/contract, and physical Android behavior. External unmanaged authenticated testing is unavailable and the endpoint currently returns 404.

## Remaining gates
Real data is NOT displaying. Restore/deploy the reviewed existing ranking service with separate deployment approval, verify hosted security/contract with worker sessions, then obtain explicit production activation approval. The flag remains false. No backend files, database, dispatch, OTP, payments, notifications, APK or published app were changed.