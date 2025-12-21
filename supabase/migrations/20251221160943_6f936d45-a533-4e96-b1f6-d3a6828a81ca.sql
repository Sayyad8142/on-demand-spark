-- Recreate all dropped policies with text type comparison

-- worker_availability policies
CREATE POLICY "Workers can view own availability" ON public.worker_availability
FOR SELECT USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_availability.worker_id AND w.user_id = auth.uid()::text)
);

CREATE POLICY "Workers can insert own availability" ON public.worker_availability
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_availability.worker_id AND w.user_id = auth.uid()::text)
);

CREATE POLICY "Workers can update own availability" ON public.worker_availability
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_availability.worker_id AND w.user_id = auth.uid()::text)
);

-- worker_blackouts policies
CREATE POLICY "Workers can manage own blackouts" ON public.worker_blackouts
FOR ALL USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_blackouts.worker_id AND w.user_id = auth.uid()::text)
) WITH CHECK (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_blackouts.worker_id AND w.user_id = auth.uid()::text)
);

-- booking_assignments policies  
CREATE POLICY "booking_assignments_worker_select_v2" ON public.booking_assignments
FOR SELECT USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = booking_assignments.worker_id AND w.user_id = auth.uid()::text)
);

CREATE POLICY "booking_assignments_worker_update_v2" ON public.booking_assignments
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = booking_assignments.worker_id AND w.user_id = auth.uid()::text)
) WITH CHECK (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = booking_assignments.worker_id AND w.user_id = auth.uid()::text)
);

-- booking_requests policies
CREATE POLICY "booking_requests_worker_select_v2" ON public.booking_requests
FOR SELECT USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = booking_requests.worker_id AND w.user_id = auth.uid()::text)
);

CREATE POLICY "booking_requests_worker_update_v2" ON public.booking_requests
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = booking_requests.worker_id AND w.user_id = auth.uid()::text)
) WITH CHECK (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = booking_requests.worker_id AND w.user_id = auth.uid()::text)
);

-- booking_status_history policies
CREATE POLICY "bsh_worker_select" ON public.booking_status_history
FOR SELECT USING (
  EXISTS (SELECT 1 FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.id = booking_status_history.booking_id AND w.user_id = auth.uid()::text)
);

CREATE POLICY "bsh_worker_insert" ON public.booking_status_history
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.id = booking_status_history.booking_id AND w.user_id = auth.uid()::text)
);

-- notification_logs policy
CREATE POLICY "notification_logs_worker_select" ON public.notification_logs
FOR SELECT USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = notification_logs.worker_id AND w.user_id = auth.uid()::text)
);

-- fcm_tokens policies
CREATE POLICY "fcm_tokens_insert_own" ON public.fcm_tokens
FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "fcm_tokens_select_own" ON public.fcm_tokens
FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "fcm_tokens_update_own" ON public.fcm_tokens
FOR UPDATE USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

-- bookings policies  
CREATE POLICY "bookings_worker_select_assigned" ON public.bookings
FOR SELECT USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = bookings.worker_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()::text)
);

CREATE POLICY "bookings_worker_update_assigned" ON public.bookings
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = bookings.worker_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()::text)
) WITH CHECK (
  EXISTS (SELECT 1 FROM workers w WHERE w.id = bookings.worker_id AND w.user_id IS NOT NULL AND w.user_id = auth.uid()::text)
);

-- workers self policies
CREATE POLICY "worker_select_self" ON public.workers
FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "worker_update_self" ON public.workers
FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "worker_insert_self" ON public.workers
FOR INSERT WITH CHECK (user_id = auth.uid()::text);