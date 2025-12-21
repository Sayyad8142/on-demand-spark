-- Step 1: Drop ALL policies that reference workers.user_id
-- This is a comprehensive drop of all possible policies
DROP POLICY IF EXISTS "bookings_worker_select_assigned" ON public.bookings;
DROP POLICY IF EXISTS "bookings_worker_update_assigned" ON public.bookings;