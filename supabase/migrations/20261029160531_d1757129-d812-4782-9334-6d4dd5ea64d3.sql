REVOKE ALL ON public.booking_start_otps, public.start_otp_releases FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.start_otp_config FROM anon, authenticated;
REVOKE SELECT ON public.start_otp_config FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_otp_bookings_guard(), public.start_otp_issue_on_assign() FROM PUBLIC, anon, authenticated;