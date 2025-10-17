-- Add user_id column to workers table without foreign key constraint (to be linked at login)
ALTER TABLE workers ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers(user_id);

COMMENT ON COLUMN workers.user_id IS 'Links worker to their authentication account for FCM tokens. Set when worker logs in.';