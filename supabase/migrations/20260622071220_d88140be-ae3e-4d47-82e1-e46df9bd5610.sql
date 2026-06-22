
CREATE TABLE public.otp_reminder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  worker_id uuid,
  user_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'otp_reminder_triggered',
    'otp_reminder_acknowledged',
    'otp_reminder_repeated',
    'otp_entered_after_reminder'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.otp_reminder_events TO authenticated;
GRANT ALL ON public.otp_reminder_events TO service_role;

ALTER TABLE public.otp_reminder_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can insert their own otp reminder events"
ON public.otp_reminder_events
FOR INSERT TO authenticated
WITH CHECK (
  user_id IS NULL OR user_id::text = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = otp_reminder_events.worker_id
      AND (w.user_id = auth.uid()::text OR w.id::text = auth.uid()::text)
  )
);

CREATE POLICY "Workers can view their own otp reminder events"
ON public.otp_reminder_events
FOR SELECT TO authenticated
USING (
  user_id::text = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = otp_reminder_events.worker_id
      AND (w.user_id = auth.uid()::text OR w.id::text = auth.uid()::text)
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX idx_otp_reminder_events_booking ON public.otp_reminder_events(booking_id, created_at DESC);
CREATE INDEX idx_otp_reminder_events_worker ON public.otp_reminder_events(worker_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_otp_reminder_event(
  p_booking_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_event_type NOT IN (
    'otp_reminder_triggered',
    'otp_reminder_acknowledged',
    'otp_reminder_repeated',
    'otp_entered_after_reminder'
  ) THEN
    RAISE EXCEPTION 'invalid_event_type: %', p_event_type;
  END IF;

  SELECT w.id INTO v_worker_id
  FROM public.workers w
  WHERE w.user_id = v_user_id::text OR w.id::text = v_user_id::text
  LIMIT 1;

  INSERT INTO public.otp_reminder_events (booking_id, worker_id, user_id, event_type, metadata)
  VALUES (p_booking_id, v_worker_id, v_user_id, p_event_type, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_otp_reminder_event(uuid, text, jsonb) TO authenticated;
