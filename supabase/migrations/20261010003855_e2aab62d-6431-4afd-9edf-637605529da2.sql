CREATE TABLE public.booking_offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_request_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'device',
  app_state text,
  app_version text,
  device_info jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_request_id, event_type)
);
CREATE INDEX idx_booking_offer_events_booking ON public.booking_offer_events(booking_id);
CREATE INDEX idx_booking_offer_events_worker ON public.booking_offer_events(worker_id, occurred_at DESC);
GRANT SELECT ON public.booking_offer_events TO authenticated;
GRANT ALL ON public.booking_offer_events TO service_role;
ALTER TABLE public.booking_offer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read offer events" ON public.booking_offer_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_booking_offer_server_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ev text;
BEGIN
  BEGIN
    IF NEW.push_sent_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.push_sent_at IS NULL) THEN
      INSERT INTO booking_offer_events(booking_request_id, booking_id, worker_id, event_type, source, occurred_at)
      VALUES (NEW.id, NEW.booking_id, NEW.worker_id, 'push_sent', 'server', NEW.push_sent_at)
      ON CONFLICT DO NOTHING;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      v_ev := CASE NEW.status
        WHEN 'accepted' THEN 'server_accepted'
        WHEN 'rejected' THEN 'server_rejected'
        WHEN 'lost' THEN 'server_lost'
        WHEN 'timeout' THEN 'server_expired'
        WHEN 'expired' THEN 'server_expired'
        WHEN 'expired_unsent' THEN 'server_expired'
        WHEN 'unreachable' THEN 'server_unreachable'
        WHEN 'not_delivered' THEN 'server_not_delivered'
        ELSE NULL END;
      IF v_ev IS NOT NULL THEN
        INSERT INTO booking_offer_events(booking_request_id, booking_id, worker_id, event_type, source)
        VALUES (NEW.id, NEW.booking_id, NEW.worker_id, v_ev, 'server')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'offer event log failed: %', SQLERRM; -- never block dispatch
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_booking_offer_server_events
AFTER INSERT OR UPDATE OF push_sent_at, status ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.log_booking_offer_server_events();