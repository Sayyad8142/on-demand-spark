-- STAGED — do not run without owner GO. Idempotent. No credentials in this file.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fcm-keepalive-job';
END $$;

SELECT cron.schedule(
  'fcm-keepalive-job',
  '*/30 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/fcm-keepalive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dispatch_internal_key' LIMIT 1)
    ),
    body := '{"source":"pg_cron"}'::jsonb
  ) AS request_id;
  $job$
);
