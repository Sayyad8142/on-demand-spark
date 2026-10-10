# Architecture rules

- Booking offer lifecycle is logged append-only in `booking_offer_events` (unique per booking_request_id + event_type): device events via the `ack-booking-delivery` edge function, server events (push_sent, final status) via a trigger on `booking_requests`. Why: one deduped, auditable timeline per offer without touching dispatch or acceptance logic.
- Offer telemetry is fire-and-forget and must never block or alter Accept/Reject; accept/reject RPCs remain the sole authority for assignment. Why: telemetry failures must not cost workers bookings.
- Worker rejections go through `reject_booking_offer` (worker taken from the session server-side, refuses expired/assigned offers, idempotent), which wraps the legacy `reject_booking_request` for tier logic; clients show "rejected" only on `confirmed: true`. Why: the app must never name another worker or claim an unconfirmed rejection.
