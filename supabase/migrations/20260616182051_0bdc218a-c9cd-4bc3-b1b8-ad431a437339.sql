CREATE TABLE IF NOT EXISTS public.dispatch_simulation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  candidate_count integer NOT NULL DEFAULT 0,
  top_worker_v2_id uuid,
  top_worker_v2_score numeric,
  top_worker_v3_id uuid,
  top_worker_v3_score numeric,
  same_top boolean GENERATED ALWAYS AS (
    top_worker_v2_id IS NOT DISTINCT FROM top_worker_v3_id
  ) STORED,
  accepted_worker_id uuid,
  accepted_at timestamptz,
  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending','accepted','rejected','timed_out','completed','no_show')),
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsl_booking ON public.dispatch_simulation_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_dsl_dispatched_at ON public.dispatch_simulation_logs(dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsl_outcome ON public.dispatch_simulation_logs(outcome);

GRANT SELECT ON public.dispatch_simulation_logs TO authenticated;
GRANT ALL ON public.dispatch_simulation_logs TO service_role;

ALTER TABLE public.dispatch_simulation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read dispatch simulation logs"
  ON public.dispatch_simulation_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.tg_dsl_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS dsl_touch_updated_at ON public.dispatch_simulation_logs;
CREATE TRIGGER dsl_touch_updated_at
BEFORE UPDATE ON public.dispatch_simulation_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_dsl_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_dsl_sync_booking_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_outcome text := NULL;
  v_accepted_worker uuid := NULL;
  v_accepted_at timestamptz := NULL;
BEGIN
  IF NEW.status = 'completed' THEN
    v_outcome := 'completed';
    v_accepted_worker := NEW.worker_id;
    v_accepted_at := COALESCE(NEW.accepted_at, OLD.accepted_at);
  ELSIF NEW.status = 'cancelled' AND COALESCE(NEW.cancel_reason,'') IN ('no_show','worker_no_show') THEN
    v_outcome := 'no_show';
    v_accepted_worker := COALESCE(NEW.worker_id, OLD.worker_id);
  ELSIF NEW.status = 'cancelled' AND NEW.accepted_at IS NOT NULL AND NEW.cancel_source = 'worker' THEN
    v_outcome := 'rejected';
    v_accepted_worker := COALESCE(NEW.worker_id, OLD.worker_id);
  ELSIF NEW.status IN ('accepted','assigned','on_the_way','started') AND NEW.worker_id IS NOT NULL THEN
    v_outcome := 'accepted';
    v_accepted_worker := NEW.worker_id;
    v_accepted_at := COALESCE(NEW.accepted_at, now());
  END IF;

  IF v_outcome IS NULL THEN RETURN NEW; END IF;

  UPDATE public.dispatch_simulation_logs
     SET outcome = v_outcome,
         outcome_at = now(),
         accepted_worker_id = COALESCE(v_accepted_worker, accepted_worker_id),
         accepted_at = COALESCE(v_accepted_at, accepted_at)
   WHERE booking_id = NEW.id
     AND (
       outcome = 'pending'
       OR (outcome = 'accepted' AND v_outcome IN ('completed','no_show','rejected'))
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dsl_booking_outcome_sync ON public.bookings;
CREATE TRIGGER dsl_booking_outcome_sync
AFTER UPDATE OF status, cancel_reason, worker_id, accepted_at ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_dsl_sync_booking_outcome();

CREATE OR REPLACE FUNCTION public.tg_dsl_check_timed_out()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_remaining integer;
BEGIN
  IF NEW.status <> 'timed_out' THEN RETURN NEW; END IF;
  IF OLD.status = 'timed_out' THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_remaining
    FROM public.booking_requests
   WHERE booking_id = NEW.booking_id
     AND status IN ('pending','accepted');

  IF v_remaining = 0 THEN
    UPDATE public.dispatch_simulation_logs
       SET outcome = 'timed_out', outcome_at = now()
     WHERE booking_id = NEW.booking_id AND outcome = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dsl_request_timed_out_sync ON public.booking_requests;
CREATE TRIGGER dsl_request_timed_out_sync
AFTER UPDATE OF status ON public.booking_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_dsl_check_timed_out();

CREATE OR REPLACE FUNCTION public.get_dispatch_simulation_summary(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH scope AS (
    SELECT * FROM public.dispatch_simulation_logs
    WHERE dispatched_at >= now() - make_interval(days => p_days)
  )
  SELECT jsonb_build_object(
    'window_days', p_days,
    'total_dispatched', (SELECT count(*) FROM scope),
    'agreement_count', (SELECT count(*) FROM scope WHERE same_top),
    'disagreement_count', (SELECT count(*) FROM scope WHERE NOT same_top AND top_worker_v3_id IS NOT NULL),
    'agreement_pct', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE ROUND((count(*) FILTER (WHERE same_top))::numeric * 100 / count(*), 2)
      END FROM scope
    ),
    'outcomes', (
      SELECT jsonb_object_agg(outcome, n) FROM (
        SELECT outcome, count(*) AS n FROM scope GROUP BY outcome
      ) o
    ),
    'would_differ_if_v3_active', (
      SELECT count(*) FROM scope
       WHERE top_worker_v3_id IS NOT NULL
         AND accepted_worker_id IS NOT NULL
         AND top_worker_v3_id <> accepted_worker_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dispatch_simulation_summary(integer) TO authenticated, service_role;