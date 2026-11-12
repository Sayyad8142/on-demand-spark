-- LOCAL REHEARSAL ONLY after 001 on a disposable PostgreSQL instance.
-- Rollback leaves no test records. Never apply this to production.
BEGIN;
DO $$
DECLARE
  u uuid := '11111111-2222-4333-8444-555555555555';
  v text;
  i integer;
BEGIN
  FOR i IN 1..3 LOOP
    v := public.claim_practice_push_attempt(u, 'practice-' || gen_random_uuid()::text, now() + interval '60 seconds', repeat('a',64));
    IF v <> 'new' THEN RAISE EXCEPTION 'claim % expected new, got %', i, v; END IF;
    UPDATE public.practice_push_attempts SET expires_at = now() - interval '1 second' WHERE user_id=u;
  END LOOP;
  v := public.claim_practice_push_attempt(u, 'practice-' || gen_random_uuid()::text, now() + interval '60 seconds', repeat('a',64));
  IF v <> 'rate_limited' THEN RAISE EXCEPTION 'fourth hourly claim must refuse, got %', v; END IF;
  UPDATE public.practice_push_attempts SET created_at=now()-interval '61 minutes' WHERE user_id=u;
  v := public.claim_practice_push_attempt(u, 'practice-' || gen_random_uuid()::text, now() + interval '60 seconds', repeat('a',64));
  IF v <> 'new' THEN RAISE EXCEPTION 'quota should recover after hour, got %',v; END IF;
  v := public.claim_practice_push_attempt(u, 'practice-' || gen_random_uuid()::text, now() + interval '60 seconds', repeat('a',64));
  IF v <> 'busy' THEN RAISE EXCEPTION 'outstanding claim must block a different id, got %',v; END IF;
  SELECT practice_id INTO v FROM public.practice_push_attempts WHERE user_id=u ORDER BY created_at DESC LIMIT 1;
  v := public.claim_practice_push_attempt(u,v,now()+interval '60 seconds',repeat('a',64));
  IF v <> 'duplicate' THEN RAISE EXCEPTION 'same attempt must never resend, got %',v; END IF;
  IF has_table_privilege('authenticated','public.practice_push_attempts','SELECT') THEN RAISE EXCEPTION 'worker can read private practice log'; END IF;
  IF has_function_privilege('authenticated','public.claim_practice_push_attempt(uuid,text,timestamptz,text)','EXECUTE') THEN RAISE EXCEPTION 'worker can bypass server claim'; END IF;
END $$;
ROLLBACK;