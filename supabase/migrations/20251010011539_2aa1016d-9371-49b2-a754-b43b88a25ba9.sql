-- Create device_tokens table for Capacitor push notifications
create table if not exists public.device_tokens (
  user_id uuid references auth.users(id) on delete cascade,
  token text primary key,
  platform text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.device_tokens enable row level security;

-- Allow users to manage their own tokens
create policy "tokens by user" on public.device_tokens
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);