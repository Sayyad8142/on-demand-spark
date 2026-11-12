# Notification transport safety

- FCM receive/tap normalize through `fcmOffer.ts` with an absolute deadline; native Accept/retry checks that original deadline via AlertPresentationRules after refresh and before sending. Why: delayed taps and refreshes must never extend an offer.

# Worker card and setup safety

- Active booking queries use an account-keyed, memory-only React Query cache; realtime rows are restricted to WORKER_BOOKING_COLUMNS and never authorize mutations. Why: instant display must not leak OTPs or another account's booking.
- Booking add-ons and Start OTP countdown use bookingCardDetails; the deadline shares server acceptance/assignment time with reminders and never blocks OTP. Why: reopening must not restart the timer or invent charges.
- Activity permission requests belong only to optional onboarding; movement monitoring checks permission without prompting. Battery continuation appears after an attempted settings return, never as a grant. Why: optional permissions must not trap or surprise workers.
- Native availability speech waits for engine initialization and settles stopped calls with a bounded completion timeout. Why: the Android dependency discards completion callbacks on stop.