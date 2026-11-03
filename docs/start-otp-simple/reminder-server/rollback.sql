-- select cron.unschedule('start-otp-flags');
drop trigger if exists trg_start_otp_reminder_cancel on public.bookings;
drop function if exists public.notify_start_otp_reminder_cancel();
drop function if exists public.refresh_start_otp_flags();
drop table if exists public.booking_start_otp_flags;
