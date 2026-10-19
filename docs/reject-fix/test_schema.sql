-- Minimal schema needed to reproduce the reject tests (columns used by the 3 functions only).
-- Live tables have more columns and 8 triggers on booking_requests; none of those triggers
-- use arrays (checked live), so they are not needed to reproduce the error.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.jwt', true),''),'{}')::jsonb $$;
CREATE TABLE public.workers(id uuid primary key, user_id text);
CREATE TABLE public.bookings(id uuid primary key, status text);
CREATE TABLE public.booking_requests(
  id uuid primary key default gen_random_uuid(), booking_id uuid, worker_id uuid, status text,
  responded_at timestamptz, order_sequence int, offered_at timestamptz, timeout_at timestamptz,
  created_at timestamptz default now());
