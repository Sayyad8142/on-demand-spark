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
  -- Outcomes move forward once; 'validated' (no-delivery transport check) is accepted.
  SELECT practice_id INTO v FROM public.practice_push_attempts WHERE user_id=u ORDER BY created_at DESC LIMIT 1;
  PERFORM public.record_practice_push_outcome(u, v, 'validated');
  PERFORM public.record_practice_push_outcome(u, v, 'provider_accepted');
  IF (SELECT outcome FROM public.practice_push_attempts WHERE user_id=u AND practice_id=v) <> 'validated' THEN RAISE EXCEPTION 'recorded outcome was overwritten'; END IF;
  -- Retention: rows older than 30 days are removed on the next claim.
  INSERT INTO public.practice_push_attempts (user_id, practice_id, token_sha256, expires_at, created_at)
    VALUES ('99999999-2222-4333-8444-555555555555', 'practice-' || gen_random_uuid()::text, repeat('b',64), now() - interval '31 days', now() - interval '31 days');
  UPDATE public.practice_push_attempts SET expires_at = now() - interval '1 second' WHERE user_id=u;
  PERFORM public.claim_practice_push_attempt(u, 'practice-' || gen_random_uuid()::text, now() + interval '60 seconds', repeat('a',64));
  IF EXISTS (SELECT 1 FROM public.practice_push_attempts WHERE created_at < now() - interval '30 days') THEN RAISE EXCEPTION 'retention did not purge'; END IF;
  IF has_function_privilege('anon','public.admin_practice_push_attempts(integer)','EXECUTE') THEN RAISE EXCEPTION 'anonymous can read practice evidence'; END IF;
END $$;
-- Non-admin login is refused; admin login reads shortened fingerprints only.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4333-8444-555555555555', true);
DO $$ BEGIN
  BEGIN PERFORM * FROM public.admin_practice_push_attempts(5); RAISE EXCEPTION 'non-admin read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.practice_push_attempts; RAISE EXCEPTION 'worker read private table';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-2222-4333-8444-555555555555', 'admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-2222-4333-8444-555555555555', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.admin_practice_push_attempts(5)) = 0 THEN RAISE EXCEPTION 'admin cannot read evidence'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_practice_push_attempts(5) WHERE length(token_hint) <> 8) THEN RAISE EXCEPTION 'full fingerprint exposed'; END IF;
END $$;
RESET ROLE;
SELECT 'ALL PRACTICE LOG ASSERTIONS PASSED' AS result;
ROLLBACK;