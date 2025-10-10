-- Create web push subscriptions table
create table if not exists public.web_push_subscriptions (
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.web_push_subscriptions enable row level security;

-- Policy: users can manage their own subscriptions
create policy "self-manage push"
on public.web_push_subscriptions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Add index for faster lookups
create index if not exists idx_web_push_subscriptions_user_id 
on public.web_push_subscriptions(user_id);