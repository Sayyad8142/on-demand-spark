-- Drop the broken trigger that references a non-existent edge function
-- and uses unconfigured app.settings variables
DROP TRIGGER IF EXISTS trg_worker_available_dispatch ON public.workers;
DROP FUNCTION IF EXISTS notify_worker_available();