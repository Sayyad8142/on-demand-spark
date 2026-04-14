ALTER TABLE public.booking_worker_movement_checks
  ADD CONSTRAINT uq_bwmc_booking_worker UNIQUE (booking_id, worker_id);
