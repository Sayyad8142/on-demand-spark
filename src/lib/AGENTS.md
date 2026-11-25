# Notification transport safety

- FCM receive/tap normalize through `fcmOffer.ts` with an absolute deadline; native Accept/retry checks that original deadline via AlertPresentationRules after refresh and before sending. Why: delayed taps and refreshes must never extend an offer.
- Every web/native/overlay/deep-link Accept calls only `try_accept_booking` (offerAcceptanceContract); favorite-v1 status is parsed only by favoriteOfferStatus / OfferAcceptanceContract.favoriteDeadline, behind an OFF flag, with no legacy fallback when ON. Why: one server-hardened endpoint stays compatible with released builds and an invalid status must never create an actionable offer.

# Worker card and setup safety

- Service pricing reads only the live parameterless get_my_service_pricing (worker-service-pricing-v1, community slugs) via useServicePricing; no raw table fallback or profile creation. Examples use the server's current booking charges, configured prices are shown separately; estimates use the read-only hosted core's floor-fee rule on the whole total, excluding loyalty/tips. Why: estimates must never authorize earnings or invent prices.

- Late Start reads Admin's live `get_my_late_start_status` (open/refocus, no polling); instant countdowns use server `deadline_at`, scheduled ones only once `deadline_rule_version` >= 2 (else existing behaviour), fallback acceptance + 10 min; warnings need server enabled+penalty_enabled, deductions only from server history. Priority Score V2 reads only `get_my_priority_score` contract 2 via `priorityScoreV2.ts` (open/manual refresh); only `v2_active` makes performance_score official, otherwise a labelled preview, any failure keeps the existing card. Shared useWorkerPriority reads exact score/reason for Home, Profile and Ranking. Why: the Admin Panel is the only scoring and deadline authority; the app never calculates or deducts points.

- Named live-dispatch display uses `liveDispatchView.ts` only behind the OFF-by-default approval gate; legacy group estimates render Position updating. Why: scores and unverified contracts must never claim production order or authorize queue names.

- Active booking queries use an account-keyed, memory-only React Query cache; realtime rows are restricted to WORKER_BOOKING_COLUMNS and never authorize mutations. Why: instant display must not leak OTPs or another account's booking.
- Booking add-ons and Start OTP countdown use bookingCardDetails; the deadline shares server acceptance/assignment time with reminders and never blocks OTP. Why: reopening must not restart the timer or invent charges.
- Activity permission requests belong only to optional onboarding; movement monitoring checks permission without prompting. Battery continuation appears after an attempted settings return, never as a grant. Why: optional permissions must not trap or surprise workers.
- Native availability speech waits for engine initialization and settles stopped calls with a bounded completion timeout. Why: the Android dependency discards completion callbacks on stop.

- Next Booking accepts only an activation-gated privacy-safe contract; its verified-session server adapter is staged under docs independently of dispatch. Why: public ranking must never reuse phone/fallback identities or authorize booking actions.- Next Booking preview verification (`nextBookingDiagnostic.ts`) activates only on the id-preview host/localhost in a browser, never published/custom domains or native; the screen reads `worker-next-booking` only through `workerNextBooking.ts` (known fields copied, position only from server groups_ahead). Why: testing must not activate ranking for real workers or invent positions.
- Service slides use `serviceTraining.ts` with explicit task IDs and glass boolean; approved Dishwashing photos remain in `dishwashingTraining.ts`. Why: unbooked/unknown tasks must never get guessed training steps.
