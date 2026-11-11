-- Undo for 001_practice_push_attempts.sql (touches nothing else).
DROP FUNCTION IF EXISTS public.record_practice_push_outcome(uuid, text, text);
DROP FUNCTION IF EXISTS public.claim_practice_push_attempt(uuid, text, timestamptz, text);
DROP TABLE IF EXISTS public.practice_push_attempts;
