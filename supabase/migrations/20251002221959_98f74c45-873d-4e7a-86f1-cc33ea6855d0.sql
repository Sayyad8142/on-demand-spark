-- Reset is_busy for all workers to allow them to receive bookings
UPDATE workers SET is_busy = false WHERE is_busy = true;