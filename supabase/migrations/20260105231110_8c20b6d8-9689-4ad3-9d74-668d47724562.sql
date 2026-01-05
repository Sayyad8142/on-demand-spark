-- =========================
-- A) WORKERS TABLE RLS FIX
-- =========================

alter table if exists public.workers enable row level security;

-- allow user to read their own worker row
drop policy if exists "workers_select_own" on public.workers;
create policy "workers_select_own"
on public.workers
for select
to authenticated
using (user_id = auth.uid()::text);

-- allow user to create their own worker row (needed if your profile screen tries insert)
drop policy if exists "workers_insert_own" on public.workers;
create policy "workers_insert_own"
on public.workers
for insert
to authenticated
with check (user_id = auth.uid()::text);

-- allow user to update their own worker row (needed for saving QR url/payload)
drop policy if exists "workers_update_own" on public.workers;
create policy "workers_update_own"
on public.workers
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

-- Drop old policies to avoid conflicts
drop policy if exists "worker_select_self" on public.workers;
drop policy if exists "worker_insert_self" on public.workers;
drop policy if exists "worker_update_self" on public.workers;
drop policy if exists "Workers can upload their own QR" on storage.objects;
drop policy if exists "Workers can update their own QR" on storage.objects;
drop policy if exists "Workers can delete their own QR" on storage.objects;
drop policy if exists "QR images are publicly accessible" on storage.objects;

-- =====================================
-- B) STORAGE BUCKET + STORAGE RLS FIX
-- =====================================

-- create bucket if missing + make public (so user app can show QR)
insert into storage.buckets (id, name, public)
values ('worker-upi-qr', 'worker-upi-qr', true)
on conflict (id) do update set public = true;

-- Public read QR images
drop policy if exists "worker_upi_qr_public_read" on storage.objects;
create policy "worker_upi_qr_public_read"
on storage.objects
for select
to public
using (bucket_id = 'worker-upi-qr');

-- Worker can upload ONLY inside their own folder: "<auth.uid()>/..."
drop policy if exists "worker_upi_qr_insert_own_folder" on storage.objects;
create policy "worker_upi_qr_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'worker-upi-qr'
  and name like (auth.uid()::text || '/%')
);

-- Worker can update ONLY their own files
drop policy if exists "worker_upi_qr_update_own_folder" on storage.objects;
create policy "worker_upi_qr_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'worker-upi-qr'
  and name like (auth.uid()::text || '/%')
)
with check (
  bucket_id = 'worker-upi-qr'
  and name like (auth.uid()::text || '/%')
);

-- Worker can delete ONLY their own files
drop policy if exists "worker_upi_qr_delete_own_folder" on storage.objects;
create policy "worker_upi_qr_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'worker-upi-qr'
  and name like (auth.uid()::text || '/%')
);