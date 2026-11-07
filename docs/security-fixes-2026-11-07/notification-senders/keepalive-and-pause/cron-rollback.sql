-- Restores the job's current (broken, placeholder) shape so behaviour is exactly as before.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fcm-keepalive-job';
END $$;
SELECT cron.schedule('fcm-keepalive-job', '*/30 * * * *', $job$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/fcm-keepalive',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY', 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
$job$);
