
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS daily_duty_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS daily_streak_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_date DATE;

CREATE OR REPLACE FUNCTION public.start_daily_duty(_worker_user_id TEXT)
RETURNS TABLE(streak INTEGER, started_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_last DATE;
  v_streak INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_today := (v_now AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT last_streak_date, COALESCE(daily_streak_count, 0)
    INTO v_last, v_streak
  FROM public.workers
  WHERE user_id = _worker_user_id OR id::text = _worker_user_id
  LIMIT 1;

  IF v_last IS NULL THEN
    v_streak := 1;
  ELSIF v_last = v_today THEN
    -- already activated today, keep streak
    v_streak := GREATEST(v_streak, 1);
  ELSIF v_last = v_today - INTERVAL '1 day' THEN
    v_streak := v_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  UPDATE public.workers
  SET daily_duty_started_at = v_now,
      last_app_opened_at = v_now,
      last_heartbeat_at = v_now,
      last_seen_at = v_now,
      last_active_at = v_now,
      daily_streak_count = v_streak,
      last_streak_date = v_today,
      updated_at = v_now
  WHERE user_id = _worker_user_id OR id::text = _worker_user_id;

  RETURN QUERY SELECT v_streak, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_daily_duty(TEXT) TO anon, authenticated, service_role;
