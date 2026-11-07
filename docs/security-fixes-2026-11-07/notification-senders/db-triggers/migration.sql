-- STAGED — NOT APPLIED. Phase 2 for DB-trigger callers of send-fcm.
-- Adds header x-internal-key (value read at call time from vault secret
-- 'dispatch_internal_key') to the two ACTIVE trigger functions that call send-fcm
-- with the public key. The Authorization header is kept unchanged so today's
-- send-fcm keeps working. Edge secret DISPATCH_INTERNAL_KEY must hold the same value.
-- Idempotent: functions that already send x-internal-key are skipped.
do $mig$
declare fn text; def text; new_def text;
begin
  foreach fn in array array['notify_assigned_worker_booking_cancelled','notify_start_otp_reminder_cancel'] loop
    select pg_get_functiondef(('public.'||fn||'()')::regprocedure) into def;
    if def like '%x-internal-key%' then raise notice '% already patched', fn; continue; end if;
    new_def := regexp_replace(def,
      '''Bearer ''\s*\|\|\s*anon_key',
      '''Bearer '' || anon_key, ''x-internal-key'', coalesce((select decrypted_secret from vault.decrypted_secrets where name = ''dispatch_internal_key'' limit 1), '''')',
      'g');
    if new_def = def then raise exception 'pattern not found in %', fn; end if;
    execute new_def;
  end loop;
end $mig$;
