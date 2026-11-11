-- STAGED ONLY — not applied. Practice-only journal; never referenced by bookings,
-- booking_requests, booking_offer_events, workers, availability, earnings or payouts.
CREATE TABLE public.practice_push_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  practice_id text NOT NULL CHECK (practice_id ~ '^practice-[0-9a-f-]{36}$'),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  outcome text NOT NULL DEFAULT 'claimed' CHECK (outcome IN ('claimed','provider_accepted','failed','unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, practice_id)
);
-- Server-only: no worker or anonymous access at all.
REVOKE ALL ON public.practice_push_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.practice_push_attempts TO service_role;
ALTER TABLE public.practice_push_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX practice_push_attempts_user_recent ON public.practice_push_attempts (user_id, expires_at DESC);

-- One outstanding attempt per login, including different practice ids and parallel phones.
CREATE OR REPLACE FUNCTION public.claim_practice_push_attempt(
  p_user_id uuid, p_practice_id text, p_expires_at timestamptz, p_token_sha256 text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_expires_at <= now() OR p_expires_at > now() + interval '65 seconds' THEN RETURN 'busy'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('practice_push:' || p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM practice_push_attempts WHERE user_id = p_user_id AND practice_id = p_practice_id) THEN
    RETURN 'duplicate';
  END IF;
  IF EXISTS (SELECT 1 FROM practice_push_attempts WHERE user_id = p_user_id AND expires_at > now()) THEN
    RETURN 'busy';
  END IF;
  INSERT INTO practice_push_attempts (user_id, practice_id, token_sha256, expires_at)
  VALUES (p_user_id, p_practice_id, p_token_sha256, p_expires_at);
  RETURN 'new';
END $$;

-- Only moves forward from 'claimed'; a recorded outcome is never overwritten.
CREATE OR REPLACE FUNCTION public.record_practice_push_outcome(
  p_user_id uuid, p_practice_id text, p_outcome text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_outcome NOT IN ('provider_accepted','failed','unknown') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
  UPDATE practice_push_attempts SET outcome = p_outcome, updated_at = now()
  WHERE user_id = p_user_id AND practice_id = p_practice_id AND outcome = 'claimed';
END $$;

REVOKE ALL ON FUNCTION public.claim_practice_push_attempt(uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_practice_push_outcome(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_practice_push_attempt(uuid, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_practice_push_outcome(uuid, text, text) TO service_role;
