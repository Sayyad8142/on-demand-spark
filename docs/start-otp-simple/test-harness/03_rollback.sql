-- Full rollback (run only after releasing open Start-OTP bookings)
UPDATE public.start_otp_config SET enabled = false;
SELECT public.admin_release_start_otp(id, 'rollback') FROM public.bookings
 WHERE start_otp_required AND status NOT IN ('completed', 'cancelled');
DROP TRIGGER IF EXISTS zza_start_otp_issue_on_assign ON public.bookings;
DROP TRIGGER IF EXISTS aab_start_otp_bookings_guard ON public.bookings;
DROP FUNCTION IF EXISTS public.admin_release_start_otp(uuid, text);
DROP FUNCTION IF EXISTS public.admin_reset_start_otp(uuid);
DROP FUNCTION IF EXISTS public.service_get_start_otp(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_my_start_otp(uuid);
DROP FUNCTION IF EXISTS public._start_otp_for_customer(uuid, uuid);
DROP FUNCTION IF EXISTS public.verify_start_otp(uuid, text);
DROP FUNCTION IF EXISTS public.start_otp_issue_on_assign();
DROP FUNCTION IF EXISTS public.start_otp_bookings_guard();
DROP FUNCTION IF EXISTS public._issue_start_otp(uuid, uuid);
DROP FUNCTION IF EXISTS public._start_otp_hash(text, text);
DROP FUNCTION IF EXISTS public._start_otp_key();
DROP TABLE IF EXISTS public.booking_start_otps;
DROP TABLE IF EXISTS public.start_otp_releases;
DROP TABLE IF EXISTS public.start_otp_config;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS start_otp_required;
DELETE FROM vault.secrets WHERE name = 'start_otp_encryption_key';
