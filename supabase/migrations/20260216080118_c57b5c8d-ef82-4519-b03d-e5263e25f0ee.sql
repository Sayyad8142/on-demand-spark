-- Remove dead cron job that calls non-existent dispatch-pending-bookings edge function
SELECT cron.unschedule('dispatch-pending-bookings-every-minute');

-- Remove the competing/broken cron job that uses raw SQL to timeout booking requests
-- (the timeout_expired_booking_requests() function already handles this via cron job 12)
SELECT cron.unschedule('check-expired-booking-requests');