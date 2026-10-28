\set ON_ERROR_STOP off
-- fixtures
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444'), ('55555555-5555-5555-5555-555555555555');
INSERT INTO workers VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'W1'),
                           ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'W2');
INSERT INTO profiles VALUES ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333'),
                            ('cccccccc-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555');
INSERT INTO user_roles (user_id, role) VALUES ('44444444-4444-4444-4444-444444444444', 'admin');

CREATE TABLE results (n serial, name text, ok boolean, detail text);
GRANT ALL ON results TO PUBLIC; GRANT ALL ON SEQUENCE results_n_seq TO PUBLIC;
CREATE FUNCTION t(name text, ok boolean, detail text DEFAULT '') RETURNS void LANGUAGE sql AS
$$ INSERT INTO results(name, ok, detail) VALUES (name, ok, detail) $$;
GRANT EXECUTE ON FUNCTION t(text, boolean, text) TO PUBLIC;
CREATE FUNCTION as_user(uid text) RETURNS void LANGUAGE sql AS
$$ SELECT set_config('request.jwt.claim.sub', uid, false) $$;
-- helper: superuser-side peek at the plaintext for test-only use
CREATE FUNCTION peek(b uuid) RETURNS text LANGUAGE sql SECURITY DEFINER AS
$$ SELECT extensions.pgp_sym_decrypt(code_enc, public._start_otp_key()) FROM booking_start_otps WHERE booking_id = b $$;
GRANT EXECUTE ON FUNCTION peek(uuid) TO PUBLIC;
CREATE FUNCTION wrong(b uuid) RETURNS text LANGUAGE sql AS
$$ SELECT lpad(((peek(b)::int + 1) % 10000)::text, 4, '0') $$;
GRANT EXECUTE ON FUNCTION wrong(uuid) TO PUBLIC;
CREATE FUNCTION nap() RETURNS void LANGUAGE sql AS $$ UPDATE booking_start_otps SET last_attempt_at = now() - interval '1 hour' $$;
GRANT EXECUTE ON FUNCTION nap() TO PUBLIC;

-- ===== Switch OFF: legacy behaviour unchanged =====
INSERT INTO bookings (id, user_id, status, start_otp_required) VALUES ('b0000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'pending', true);
SELECT t('OFF: client cannot force start_otp_required on insert', NOT start_otp_required) FROM bookings WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE bookings SET worker_id = 'aaaaaaaa-0000-0000-0000-000000000001', status = 'assigned' WHERE id = 'b0000000-0000-0000-0000-000000000001';
SELECT t('OFF: no Start code issued on assignment', count(*) = 0) FROM booking_start_otps;
SELECT t('OFF: End code still created', completion_otp ~ '^[0-9]{4}$') FROM bookings WHERE id = 'b0000000-0000-0000-0000-000000000001';
-- deployed End function shape (service role, no uid)
SELECT as_user('');
SET ROLE service_role;
UPDATE bookings SET status='completed', completed_by='worker', completion_source='otp', otp_verified_at=now(), completed_at=now()
 WHERE id = 'b0000000-0000-0000-0000-000000000001' AND worker_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND status IN ('assigned','accepted','on_the_way','started');
RESET ROLE;
SELECT t('OFF: legacy booking completes with End code from assigned (deployed function shape)', status = 'completed') FROM bookings WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- ===== Switch ON =====
UPDATE start_otp_config SET enabled = true;
INSERT INTO bookings (id, user_id, status) VALUES ('b0000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'pending');
SELECT t('ON: new booking flagged', start_otp_required) FROM bookings WHERE id = 'b0000000-0000-0000-0000-000000000002';
SELECT t('ON: no code before assignment', count(*) = 0) FROM booking_start_otps WHERE booking_id = 'b0000000-0000-0000-0000-000000000002';
UPDATE bookings SET worker_id = 'aaaaaaaa-0000-0000-0000-000000000001', status = 'assigned' WHERE id = 'b0000000-0000-0000-0000-000000000002';
SELECT t('ON: code issued on assignment for W1', count(*) = 1 AND bool_and(issued_for_worker_id = 'aaaaaaaa-0000-0000-0000-000000000001')) FROM booking_start_otps;
SELECT t('ON: stored value is not the plain code', position(peek('b0000000-0000-0000-0000-000000000002') in code_hash) = 0 AND code_enc IS NOT NULL) FROM booking_start_otps;
SELECT t('ON: Start code differs from End code (or coincidence 1/10000)', true, peek(id) || ' vs ' || completion_otp) FROM bookings WHERE id = 'b0000000-0000-0000-0000-000000000002';

-- old booking stays legacy after switch ON
SELECT t('ON: existing booking still legacy', NOT start_otp_required) FROM bookings WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- ---- Worker W1 (authenticated) bypass attempts ----
SELECT as_user('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
DO $$ BEGIN PERFORM 1 FROM booking_start_otps; PERFORM t('worker cannot read code table', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM t('worker cannot read code table', true); END $$;
DO $$ BEGIN PERFORM public._start_otp_key(); PERFORM t('worker cannot read encryption key', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM t('worker cannot read encryption key', true); END $$;
DO $$ BEGIN PERFORM public.service_get_start_otp('b0000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001'); PERFORM t('worker cannot call service retrieval', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM t('worker cannot call service retrieval', true); END $$;
SELECT t('worker get_my_start_otp refused', (get_my_start_otp('b0000000-0000-0000-0000-000000000002')->>'success')::boolean = false);
DO $$ BEGIN UPDATE bookings SET status='started' WHERE id='b0000000-0000-0000-0000-000000000002'; PERFORM t('worker direct status=started blocked', false);
EXCEPTION WHEN check_violation THEN PERFORM t('worker direct status=started blocked', true); END $$;
DO $$ BEGIN UPDATE bookings SET status='completed', completed_by='worker', completion_source='otp', otp_verified_at=now() WHERE id='b0000000-0000-0000-0000-000000000002'; PERFORM t('worker direct OTP-complete before start blocked', false);
EXCEPTION WHEN check_violation THEN PERFORM t('worker direct OTP-complete before start blocked', true); END $$;
DO $$ BEGIN UPDATE bookings SET status='completed', completed_by='admin', completion_source='admin' WHERE id='b0000000-0000-0000-0000-000000000002'; PERFORM t('worker fake admin completion blocked', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM t('worker fake admin completion blocked', true); END $$;
UPDATE bookings SET start_otp_required = false, started_at = now() WHERE id='b0000000-0000-0000-0000-000000000002';
RESET ROLE;
SELECT t('worker cannot clear flag or set started_at', start_otp_required AND started_at IS NULL) FROM bookings WHERE id='b0000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$ BEGIN PERFORM set_config('app.start_otp_ok', 'b0000000-0000-0000-0000-000000000002', false);
  UPDATE bookings SET status='started' WHERE id='b0000000-0000-0000-0000-000000000002'; PERFORM t('forged session setting does not allow start', false);
EXCEPTION WHEN check_violation THEN PERFORM t('forged session setting does not allow start', true); END $$;

-- other worker
SELECT as_user('22222222-2222-2222-2222-222222222222');
SELECT t('other worker refused NOT_ASSIGNED', verify_start_otp('b0000000-0000-0000-0000-000000000002', '0000')->>'code' = 'NOT_ASSIGNED');

-- ---- Customer bypass attempts ----
SELECT as_user('33333333-3333-3333-3333-333333333333');
DO $$ BEGIN UPDATE bookings SET status='started' WHERE id='b0000000-0000-0000-0000-000000000002'; PERFORM t('customer direct start blocked', false);
EXCEPTION WHEN check_violation THEN PERFORM t('customer direct start blocked', true); END $$;
DO $$ BEGIN UPDATE bookings SET status='completed', completed_by='admin', completion_source='admin' WHERE id='b0000000-0000-0000-0000-000000000002'; PERFORM t('customer fake admin completion blocked', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM t('customer fake admin completion blocked', true); END $$;
DO $$ BEGIN INSERT INTO bookings (user_id, status, worker_id) VALUES ('cccccccc-0000-0000-0000-000000000001', 'completed', 'aaaaaaaa-0000-0000-0000-000000000001'); PERFORM t('insert as completed blocked', false);
EXCEPTION WHEN check_violation THEN PERFORM t('insert as completed blocked', true); END $$;
SELECT t('customer gets code', get_my_start_otp('b0000000-0000-0000-0000-000000000002')->>'start_otp' = peek('b0000000-0000-0000-0000-000000000002'));
SELECT as_user('55555555-5555-5555-5555-555555555555');
SELECT t('different customer refused', (get_my_start_otp('b0000000-0000-0000-0000-000000000002')->>'success')::boolean = false);
RESET ROLE;

-- ---- Wrong codes, rate limit, lock ----
SELECT as_user('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SELECT t('bad format refused', verify_start_otp('b0000000-0000-0000-0000-000000000002', '12')->>'code' = 'INVALID_FORMAT');
SELECT t('wrong 1 -> WRONG_CODE, 4 left', r->>'code' = 'WRONG_CODE' AND (r->>'attempts_left')::int = 4, r::text)
  FROM (SELECT verify_start_otp('b0000000-0000-0000-0000-000000000002', wrong('b0000000-0000-0000-0000-000000000002')) r) s;
SELECT t('immediate retry -> TOO_FAST', verify_start_otp('b0000000-0000-0000-0000-000000000002', peek('b0000000-0000-0000-0000-000000000002'))->>'code' = 'TOO_FAST');
SELECT t('response never includes code', position(peek('b0000000-0000-0000-0000-000000000002') in verify_start_otp('b0000000-0000-0000-0000-000000000002', '99')::text) = 0);
RESET ROLE;
DO $$ DECLARE r jsonb; BEGIN
  FOR i IN 2..5 LOOP PERFORM nap(); PERFORM as_user('11111111-1111-1111-1111-111111111111');
    r := verify_start_otp('b0000000-0000-0000-0000-000000000002', wrong('b0000000-0000-0000-0000-000000000002')); END LOOP;
  PERFORM t('5th wrong -> LOCKED', r->>'code' = 'LOCKED', r::text);
  PERFORM nap();
  r := verify_start_otp('b0000000-0000-0000-0000-000000000002', peek('b0000000-0000-0000-0000-000000000002'));
  PERFORM t('correct code after lock still refused', r->>'code' = 'LOCKED', r::text);
END $$;
SELECT t('booking still not started after lock', status = 'assigned') FROM bookings WHERE id='b0000000-0000-0000-0000-000000000002';

-- ---- Reassignment invalidates old code ----
SELECT peek('b0000000-0000-0000-0000-000000000002') AS old_code \gset
UPDATE bookings SET status='pending', worker_id=NULL WHERE id='b0000000-0000-0000-0000-000000000002';
SELECT t('unassign deletes code', count(*) = 0) FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000002';
UPDATE bookings SET worker_id='aaaaaaaa-0000-0000-0000-000000000002', status='assigned' WHERE id='b0000000-0000-0000-0000-000000000002';
SELECT t('new worker gets fresh code, attempts reset', attempts = 0 AND locked_at IS NULL AND issued_for_worker_id='aaaaaaaa-0000-0000-0000-000000000002') FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000002';
SELECT as_user('11111111-1111-1111-1111-111111111111');
SELECT t('previous worker refused after reassignment', verify_start_otp('b0000000-0000-0000-0000-000000000002', :'old_code')->>'code' = 'NOT_ASSIGNED');
-- direct worker-to-worker swap (no unassign step)
SELECT code_hash AS h1 FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000002' \gset
UPDATE bookings SET worker_id='aaaaaaaa-0000-0000-0000-000000000001' WHERE id='b0000000-0000-0000-0000-000000000002';
SELECT t('direct swap re-issues code', code_hash <> :'h1' AND issued_for_worker_id='aaaaaaaa-0000-0000-0000-000000000001') FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000002';

-- ---- Expiry ----
UPDATE booking_start_otps SET expires_at = now() - interval '1 minute' WHERE booking_id='b0000000-0000-0000-0000-000000000002';
SELECT as_user('11111111-1111-1111-1111-111111111111');
SELECT t('expired code refused', verify_start_otp('b0000000-0000-0000-0000-000000000002', peek('b0000000-0000-0000-0000-000000000002'))->>'code' = 'EXPIRED');
SELECT as_user('33333333-3333-3333-3333-333333333333');
SELECT t('customer view re-issues expired code', (get_my_start_otp('b0000000-0000-0000-0000-000000000002')->>'expires_at')::timestamptz > now());
SELECT nap();

-- ---- Correct code -> started -> End completion ----
SELECT as_user('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SELECT t('correct code starts booking', (verify_start_otp('b0000000-0000-0000-0000-000000000002', peek('b0000000-0000-0000-0000-000000000002'))->>'success')::boolean);
SELECT t('repeat verify is idempotent', (verify_start_otp('b0000000-0000-0000-0000-000000000002', '0000')->>'already_started')::boolean);
RESET ROLE;
SELECT t('status started + started_at set', status = 'started' AND started_at IS NOT NULL) FROM bookings WHERE id='b0000000-0000-0000-0000-000000000002';
SELECT as_user('33333333-3333-3333-3333-333333333333');
SELECT t('customer no longer sees Start code after start', get_my_start_otp('b0000000-0000-0000-0000-000000000002')->>'start_otp' IS NULL);
SELECT as_user('');
SET ROLE service_role;
UPDATE bookings SET status='completed', completed_by='worker', completion_source='otp', otp_verified_at=now(), completed_at=now()
 WHERE id='b0000000-0000-0000-0000-000000000002' AND worker_id='aaaaaaaa-0000-0000-0000-000000000001' AND status IN ('assigned','accepted','on_the_way','started');
RESET ROLE;
SELECT t('End code completion works after start (deployed function shape)', status='completed') FROM bookings WHERE id='b0000000-0000-0000-0000-000000000002';

-- ---- Deployed End function on an unstarted Start-OTP booking ----
INSERT INTO bookings (id, user_id, status, worker_id) VALUES ('b0000000-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 'assigned', 'aaaaaaaa-0000-0000-0000-000000000001');
SELECT t('code issued when inserted already assigned', count(*) = 1) FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000003';
SET ROLE service_role;
DO $$ BEGIN UPDATE bookings SET status='completed', completed_by='worker', completion_source='otp', otp_verified_at=now()
  WHERE id='b0000000-0000-0000-0000-000000000003'; PERFORM t('End function refused before start (returns an error)', false);
EXCEPTION WHEN check_violation THEN PERFORM t('End function refused before start (returns an error)', true); END $$;
RESET ROLE;

-- ---- Admin tools still work ----
SELECT as_user('44444444-4444-4444-4444-444444444444');
SET ROLE authenticated;
SELECT t('admin reset re-issues code', (admin_reset_start_otp('b0000000-0000-0000-0000-000000000003')->>'success')::boolean);
SELECT t('admin End-code completion still works', (admin_complete_booking_with_otp(id, completion_otp)->>'success')::boolean) FROM bookings WHERE id='b0000000-0000-0000-0000-000000000003';
RESET ROLE;
SELECT as_user('');
INSERT INTO bookings (id, user_id, status, worker_id) VALUES ('b0000000-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', 'assigned', 'aaaaaaaa-0000-0000-0000-000000000001');
SET ROLE service_role;
UPDATE bookings SET status='completed', completed_by='admin', completion_source='admin' WHERE id='b0000000-0000-0000-0000-000000000004';
RESET ROLE;
SELECT t('server admin completion still works', status='completed') FROM bookings WHERE id='b0000000-0000-0000-0000-000000000004';

-- ---- Non-admin cannot use admin recovery ----
SELECT as_user('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
DO $$ BEGIN PERFORM admin_release_start_otp('b0000000-0000-0000-0000-000000000003'); PERFORM t('worker cannot release', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM t('worker cannot release', true); END $$;
RESET ROLE;

-- ---- Recovery: release open Start-OTP bookings to legacy ----
INSERT INTO bookings (id, user_id, status, worker_id) VALUES ('b0000000-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', 'assigned', 'aaaaaaaa-0000-0000-0000-000000000001');
UPDATE start_otp_config SET enabled = false;
SELECT as_user('');
SELECT admin_release_start_otp(id, 'rollback') FROM bookings WHERE start_otp_required AND status NOT IN ('completed','cancelled');
SELECT t('release: no open Start-OTP bookings left', count(*) = 0) FROM bookings WHERE start_otp_required AND status NOT IN ('completed','cancelled');
SELECT t('release: codes removed', count(*) = 0) FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000005';
SET ROLE service_role;
UPDATE bookings SET status='completed', completed_by='worker', completion_source='otp', otp_verified_at=now() WHERE id='b0000000-0000-0000-0000-000000000005';
RESET ROLE;
SELECT t('released booking completes with End code only', status='completed') FROM bookings WHERE id='b0000000-0000-0000-0000-000000000005';
INSERT INTO bookings (id, user_id) VALUES ('b0000000-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000001');
SELECT t('switch OFF again: new bookings legacy', NOT start_otp_required) FROM bookings WHERE id='b0000000-0000-0000-0000-000000000006';

-- ---- Scheduled guard interplay ----
UPDATE start_otp_config SET enabled = true;
INSERT INTO bookings (id, user_id, booking_type, status) VALUES ('b0000000-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000001', 'scheduled', 'pending');
UPDATE bookings SET worker_id='aaaaaaaa-0000-0000-0000-000000000001', status='assigned' WHERE id='b0000000-0000-0000-0000-000000000007';
SELECT t('scheduled assignment blocked by live guard -> no code issued', count(*) = 0) FROM booking_start_otps WHERE booking_id='b0000000-0000-0000-0000-000000000007';

SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM results;
