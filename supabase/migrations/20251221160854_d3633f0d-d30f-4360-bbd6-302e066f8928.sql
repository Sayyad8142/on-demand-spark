-- Drop ALL policies that might depend on workers.user_id
-- worker_availability policies
DROP POLICY IF EXISTS "Workers can insert own availability" ON public.worker_availability;
DROP POLICY IF EXISTS "Workers can update own availability" ON public.worker_availability;
DROP POLICY IF EXISTS "Workers can view own availability" ON public.worker_availability;

-- worker_blackouts policies
DROP POLICY IF EXISTS "Workers can manage own blackouts" ON public.worker_blackouts;

-- booking_assignments policies
DROP POLICY IF EXISTS "booking_assignments_worker_select_v2" ON public.booking_assignments;
DROP POLICY IF EXISTS "booking_assignments_worker_update_v2" ON public.booking_assignments;

-- booking_requests policies
DROP POLICY IF EXISTS "booking_requests_worker_select_v2" ON public.booking_requests;
DROP POLICY IF EXISTS "booking_requests_worker_update_v2" ON public.booking_requests;

-- booking_status_history policies
DROP POLICY IF EXISTS "bsh_worker_insert" ON public.booking_status_history;
DROP POLICY IF EXISTS "bsh_worker_select" ON public.booking_status_history;

-- notification_logs policies
DROP POLICY IF EXISTS "notification_logs_worker_select" ON public.notification_logs;

-- fcm_tokens policies
DROP POLICY IF EXISTS "fcm_tokens_insert_own" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_select_own" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_update_own" ON public.fcm_tokens;

-- workers policies that reference user_id
DROP POLICY IF EXISTS "worker_insert_self" ON public.workers;
DROP POLICY IF EXISTS "worker_select_self" ON public.workers;
DROP POLICY IF EXISTS "worker_update_self" ON public.workers;