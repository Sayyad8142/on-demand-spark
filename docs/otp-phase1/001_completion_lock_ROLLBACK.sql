-- ROLLBACK for 001_completion_lock_DRAFT.sql — DRAFT, NOT EXECUTED.
-- Removes exactly the objects that draft creates, in dependency order:
--   trigger aaa1_guard_booking_completion_lock ON public.bookings
--   function public.guard_booking_completion_lock()
--   function public._is_trusted_completion_caller()
-- No data is changed. Bookings, OTPs, payouts and booking_events rows (incl.
-- 'admin_completion' audit rows written while the patch was live) are kept.
-- Intentionally NOT reverted: the REVOKE on public.update_booking_status(uuid, text);
-- it was already not executable by app users before the patch (LIVE-READ 18 Oct).

BEGIN;
DROP TRIGGER IF EXISTS aaa1_guard_booking_completion_lock ON public.bookings;
DROP FUNCTION IF EXISTS public.guard_booking_completion_lock();
DROP FUNCTION IF EXISTS public._is_trusted_completion_caller();
COMMIT;

-- Verify after rollback (expect 0 rows each):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'aaa1_guard_booking_completion_lock';
--   SELECT proname FROM pg_proc WHERE proname IN ('guard_booking_completion_lock','_is_trusted_completion_caller');
