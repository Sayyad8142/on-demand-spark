-- Removes the x-internal-key header again (restores the original call).
do $rb$
declare fn text; def text; new_def text;
begin
  foreach fn in array array['notify_assigned_worker_booking_cancelled','notify_start_otp_reminder_cancel'] loop
    select pg_get_functiondef(('public.'||fn||'()')::regprocedure) into def;
    new_def := replace(def, ', ''x-internal-key'', coalesce((select decrypted_secret from vault.decrypted_secrets where name = ''dispatch_internal_key'' limit 1), '''')', '');
    if new_def <> def then execute new_def; end if;
  end loop;
end $rb$;
