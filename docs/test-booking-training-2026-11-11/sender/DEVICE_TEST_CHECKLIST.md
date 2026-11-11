# Test Booking notification — Android device checklist

Run only after approval of: (1) applying `staged/sql/001_practice_push_attempts.sql`, (2) deploying `staged/send-practice-notification/` with `verify_jwt = true` and `PRACTICE_PUSH_SENDER=on`, (3) a signed APK built from this source with `PRACTICE_PUSH_ENABLED = true` installed on **one test phone** logged in as **one test worker**.

Before and after the whole run, record counts for that worker: bookings, booking_requests, booking_offer_events, worker availability rows, payouts. **They must be identical.** Mark each line PASS / FAIL / NOT RUN.

## Foreground (app open on Test Booking)
1. Tap Send Test Notification → screen shows "Waiting for your phone"; sound + vibration heard/felt within ~5 s (human check).
2. Pop-up shows TEST BOOKING, Maid, Dishwashing, ₹100, Flat 001, 60 s countdown.
3. Accept → app shows Booking Details (Accepted). Start OTP 1234 → In Progress. Complete OTP 1234 → success. Back to Home works.
4. Repeat, tap Reject → "Practice Booking Rejected"; nothing else changes.
5. Repeat, wait 60 s without tapping → "Practice Booking Expired"; sound stops.
6. Checklist shows Passed for sent/received/overlay/accepted/start/started/complete/completed.

## Background (app minimised, screen on)
7. Send, press Home within 2 s. Pop-up + sound appear over the launcher.
8. Accept → the app opens directly on the practice Booking Details (not Bookings, not Home).

## Closed app (swiped away from recents)
9. Send, swipe the app away within 2 s. Pop-up or tray notification still arrives.
10. Accept → app cold-starts and opens practice Booking Details for the same practice; OTP steps work.
11. Tray notification only (overlay permission OFF): tapping it shows the practice pop-up; no real booking screen opens.
12. Force-stopped app (Settings → Force stop): document result. Android may block delivery until reopened — this is expected, not a failure.

## Safety
13. Tap Send twice quickly → only one notification; second tap shows "wait one minute".
14. Send from a second phone logged in as the same worker within 60 s → refused; first phone unaffected.
15. Log out right after Send → nothing appears; logging in as a different worker on the same phone shows no practice pop-up.
16. Notifications OFF (app or "Practice bookings" channel) → Send refused with "Allow notifications".
17. With a real active booking (any status assigned…in_progress) → Test Booking button disabled; server refuses if called.
18. Real offer arriving while the practice pop-up shows → practice pop-up closes immediately; real alert appears normally and Accept works.
19. Airplane mode → "No internet" message; nothing sent.
20. Reinstall app (new token) without opening it fully, then Send → "phone registration changed"; after normal token sync it works.
21. Low battery / Doze (screen off 10+ min) → document delay; practice expires after 60 s if late.
22. Sound and vibration stop on Accept, Reject, expiry and real-offer preemption (no lingering ringtone).

## After the run
23. Database counts from the top are unchanged.
24. `practice_push_attempts` has one row per send with outcome provider_accepted/failed/unknown.
25. Function logs contain no tokens, phone numbers or worker ids.
