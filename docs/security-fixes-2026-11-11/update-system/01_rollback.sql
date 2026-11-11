-- Rollback for 01_version_monitoring_observe_only.sql (reviewed; run only if 01 was applied).
DROP FUNCTION IF EXISTS public.log_worker_app_event(text,text,integer,text,timestamptz);
DROP FUNCTION IF EXISTS public.admin_worker_version_fleet();
DROP TABLE IF EXISTS public.worker_app_events;
