-- Now change workers.user_id from uuid to text to support Firebase UIDs
ALTER TABLE public.workers ALTER COLUMN user_id TYPE text;