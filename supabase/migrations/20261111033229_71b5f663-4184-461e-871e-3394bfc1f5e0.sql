CREATE OR REPLACE FUNCTION public.admin_worker_version_fleet()
RETURNS TABLE (app_version text, build_number text, workers bigint, available_workers bigint, last_seen timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT coalesce(w.app_version,'(unknown)'), coalesce(w.build_number,'(unknown)'),
           count(*), count(*) FILTER (WHERE w.is_available), max(w.last_seen_at)
    FROM public.workers w
    WHERE w.last_seen_at > now() - interval '14 days'
    GROUP BY 1,2 ORDER BY 3 DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_worker_version_fleet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_worker_version_fleet() TO authenticated;

CREATE TABLE IF NOT EXISTS public.worker_app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  event text NOT NULL,
  app_version text,
  build_number integer,
  detail text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.worker_app_events TO authenticated;
GRANT ALL ON public.worker_app_events TO service_role;
ALTER TABLE public.worker_app_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read app events" ON public.worker_app_events FOR SELECT TO authenticated USING (public.is_admin());
CREATE INDEX IF NOT EXISTS worker_app_events_worker_time ON public.worker_app_events(worker_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.log_worker_app_event(p_event text, p_app_version text, p_build integer, p_detail text, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_worker uuid;
BEGIN
  SELECT id INTO v_worker FROM public.workers WHERE user_id = auth.uid()::text LIMIT 1;
  IF v_worker IS NULL THEN RAISE EXCEPTION 'WORKER_NOT_LINKED' USING ERRCODE = 'P0001'; END IF;
  IF p_event IS NULL OR p_event !~ '^[a-z_]{3,40}$' THEN RAISE EXCEPTION 'BAD_EVENT' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.worker_app_events(worker_id, event, app_version, build_number, detail, occurred_at)
  VALUES (v_worker, p_event, left(p_app_version, 40), p_build, left(p_detail, 200), least(coalesce(p_at, now()), now()));
END $$;
REVOKE ALL ON FUNCTION public.log_worker_app_event(text,text,integer,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_worker_app_event(text,text,integer,text,timestamptz) TO authenticated;