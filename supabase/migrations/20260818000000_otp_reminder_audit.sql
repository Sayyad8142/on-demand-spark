CREATE TABLE public.otp_reminder_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('otp_reminder_triggered', 'otp_reminder_acknowledged', 'otp_reminder_repeated', 'otp_entered_after_reminder')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT INSERT ON public.otp_reminder_events TO authenticated;
GRANT SELECT ON public.otp_reminder_events TO authenticated;
GRANT ALL ON public.otp_reminder_events TO service_role;

ALTER TABLE public.otp_reminder_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can insert their own otp reminder events"
ON public.otp_reminder_events
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workers
        WHERE id = worker_id
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Workers can select their own otp reminder events"
ON public.otp_reminder_events
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workers
        WHERE id = worker_id
        AND user_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.log_otp_reminder_event(
    p_booking_id uuid,
    p_event_type text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_worker_id uuid;
BEGIN
    SELECT id INTO v_worker_id FROM public.workers WHERE user_id = auth.uid();
    
    IF v_worker_id IS NOT NULL THEN
        INSERT INTO public.otp_reminder_events (booking_id, worker_id, event_type, metadata)
        VALUES (p_booking_id, v_worker_id, p_event_type, p_metadata);
    END IF;
END;
$$;
