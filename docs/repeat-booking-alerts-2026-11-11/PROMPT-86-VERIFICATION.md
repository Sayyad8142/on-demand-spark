# Prompt 86 — Final verification of the repeated-booking alert fix (preview only)

Nothing deployed, published, or changed on live services. Backup: `/tmp/backup-86` (SHA-256 manifest, sandbox only).

## New defect found and fixed during verification
SOURCE: the 10-minute local lock was released only by BOOKING_CANCELLED / BOOKING_REASSIGNED pushes.
A booking accepted from the native popup and **completed within 10 minutes**, or a cancellation whose push
never arrived, kept suppressing new offers until the window expired.

Fix (preview/source):
- `src/lib/bookingEndRelease.ts` — pure rules: a server realtime update for MY booking with a non-active status
  (completed/cancelled/…) or a successful re-read with NO active work ends the previously confirmed booking.
  A different active booking or a failed read never releases.
- `useActiveJob.ts` — calls the release fire-and-forget; no change to what the screen shows.
- `OverlayPlugin.releaseEndedBooking` — calls the existing `OfferQueue.releaseEndedBooking` (matching accepted
  booking only). Older installed apps without the method keep the 10-minute expiry.

## Checklist
| Requirement | Result | Evidence |
|---|---|---|
| Cancelled booking releases lock immediately | PASS (automated) | `acceptCancelThenSecondOfferIsNotBusyOrDuplicate` |
| Completed booking does not block next | PASS (automated) after fix | `completedAcceptedBookingReleasesLockForNextOffer`, JS `bookingEndRelease.test.ts` |
| Rejected / expired / dismissed offer does not block | PASS (automated) | `rejectThenSecondOffer`, `timeoutThenSecondOffer`, `dismissedThenSecondOffer` |
| New offer ID opens immediately | PASS (automated) | `differentServerOfferIdentityRemainsIndependent` |
| Duplicate same offer stays blocked | PASS (automated) | `duplicateSameOfferIsNotQueuedTwice`, `retiredDuplicateCannotReopenAfterDismissal` |
| Full-screen alert opens repeatedly without restart | SOURCE only | onNewIntent + per-offer reset; `threeConsecutiveOffersEachOpenAfterTheLastEnds` covers the queue, not the screen |
| Sound, vibration, countdown, Accept/Reject on consecutive offers | NOT VERIFIED | needs a real phone |
| Lock release never touches backend assignment/dispatch | PASS (source + tests) | release is SharedPreferences only, no network; JS test asserts no fetch; other bookings untouched |

## Runs
- Frontend: 510/510 pass (9 new). TypeScript clean.
- Android: compile + unit tests BUILD SUCCESSFUL; 27/27 native tests (3 new). Build output removed from repo.

## Decision
GO for controlled real-device testing on one test phone with test bookings.
NO-GO for publishing or a live rollout until the device checks pass.

## Device checks still required
1. Accept from popup, complete within 10 min → next offer alerts.
2. Accept → admin cancels → next offer alerts (with and without the cancel push reaching the phone).
3. Reject, let expire, dismiss → next offer alerts.
4. Three offers back-to-back: full-screen alert, sound, vibration, correct countdown, Accept/Reject each time, app never restarted.
5. Same offer pushed twice → shown once.
6. Locked screen, screen off, app closed, battery saver; with and without "Display over other apps".
