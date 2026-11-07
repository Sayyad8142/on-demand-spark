-- Copy of the two live trigger functions (read 2026-11-07), key replaced by a placeholder.
CREATE OR REPLACE FUNCTION public.notify_assigned_worker_booking_cancelled()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  fn_url text := 'https://example.invalid/functions/v1/send-fcm';
  anon_key text := 'PUBLIC_ANON_KEY_PLACEHOLDER';
  target_worker_id uuid;
begin
  target_worker_id := coalesce(old.worker_id, new.worker_id);
  if target_worker_id is null then return new; end if;
  if old.status is distinct from new.status
     and lower(coalesce(new.status, '')) in ('cancelled', 'canceled') then
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'workerIds', jsonb_build_array(target_worker_id::text),
        'title', 'BOOKING CANCELLED',
        'body', 'Your booking was cancelled. Do not go to the flat.',
        'data', jsonb_build_object('type', 'BOOKING_CANCELLED', 'bookingId', new.id::text, 'booking_id', new.id::text,
          'booking_type', coalesce(new.booking_type, 'instant'), 'title', 'BOOKING CANCELLED',
          'body', 'Your booking was cancelled. Do not go to the flat.')
      )
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_start_otp_reminder_cancel()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  fn_url text := 'https://example.invalid/functions/v1/send-fcm';
  anon_key text := 'PUBLIC_ANON_KEY_PLACEHOLDER';
  v_reason text;
begin
  if old.start_otp_required is not true or old.worker_id is null or old.started_at is not null then return new; end if;
  if old.status not in ('assigned','accepted','on_the_way') then return new; end if;
  v_reason := case when new.started_at is not null then 'otp_verified'
    when new.worker_id is distinct from old.worker_id then 'reassigned'
    when new.status not in ('assigned','accepted','on_the_way') then new.status else null end;
  if v_reason is null then return new; end if;
  begin
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || anon_key),
      body := jsonb_build_object('workerIds', jsonb_build_array(old.worker_id::text), 'title', 'reminder_cancel', 'body', 'reminder_cancel',
        'data', jsonb_build_object('type','START_OTP_REMINDER_CANCEL','booking_id', new.id::text,'reason', v_reason)));
  exception when others then null;
  end;
  begin
    update booking_start_otp_flags set resolved_at = now(), updated_at = now(), resolution = 'cancelled'
     where booking_id = new.id and resolved_at is null;
  exception when others then null;
  end;
  return new;
end $function$;
