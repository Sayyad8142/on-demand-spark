-- Rollback for Reconnection Reminder Step 2 (applied 2026-11-04). Safe: nothing reads these yet.
drop function if exists public.admin_set_reconnect_pause(uuid, boolean);
drop function if exists public.set_reconnect_pause(boolean);
drop function if exists public.record_verified_app_open();
drop table if exists public.worker_reconnect_followups;
drop trigger if exists trg_guard_reconnect_columns on public.workers;
drop function if exists public.guard_reconnect_columns();
alter table public.workers
  drop column if exists last_verified_app_open_at,
  drop column if exists last_reconnect_reminder_at,
  drop column if exists reconnect_paused_by_worker,
  drop column if exists reconnect_paused_by_admin;
