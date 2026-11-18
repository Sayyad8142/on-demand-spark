# Start Booking button — preview verification

## Implemented
- Removed only the visible Start OTP countdown, play icon and separate delayed warning.
- Start button uses a green design-system variant; delayed button uses a red variant with warning icon and translated “Start OTP Delayed — Enter OTP” text.
- Both states retain the same height and existing navigation/disabled behavior.
- One CSS pulse alternates red tones every 2.4 seconds without scaling or flashing. Reduced-motion preference disables it.
- The unchanged server-acceptance-based countdown still decides delay; OTP verification, thresholds, alarms, backend and booking transitions are unchanged.
- Address, service images and earnings are unchanged.

## Verified
- TEST: 62 focused OTP, compatibility, countdown and reminder tests passed, including ten-minute boundary and removal of delayed state after server start/cancellation/completion.
- PREVIEW FIXTURE: Actual ActiveJobCard rendered with isolated booking examples and mocked external dependencies at widths 320, 393, 480 and 1280 in English, Hindi and Telugu. Normal, delayed, server-started and cancelled states passed; controls fit, no horizontal overflow or page errors, and reduced motion disables animation. These checks do not establish hosted OTP success.
- BUILD: Preview build OK after edits.
- SOURCE: use-mobile.tsx explicitly imports React hooks; the quoted UMD identifier is absent. Reported error not reproduced; no speculative hook edit.

## Not verified / release gates
- NOT VERIFIED: Authenticated signup/booking/Start OTP end-to-end on the external unmanaged backend; no worker session available.
- NOT VERIFIED: Physical Android screen sizes, installed APK and device reduced-motion behavior.
- No backend deployment, push sending, APK publication or app publication performed. Publication requires separate approval.