-- Fix infinite recursion in workers RLS policies
drop policy if exists "worker_select_self" on workers;
drop policy if exists "worker_update_self" on workers;
drop policy if exists "worker_insert_self" on workers;
drop policy if exists "Workers can view own profile" on workers;
drop policy if exists "Workers can update own profile" on workers;

-- Clean policies for workers table
create policy "worker_select_self"
on workers for select
using (id = auth.uid());

create policy "worker_update_self"
on workers for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "worker_insert_self"
on workers for insert
with check (id = auth.uid());

-- Add try_accept_booking RPC (concurrency-safe)
create or replace function public.try_accept_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings;
  w workers;
begin
  -- Get worker details
  select * into w from workers where id = auth.uid();
  
  if not found then
    raise exception 'Worker not found';
  end if;

  -- Lock and get booking
  select * into b from bookings
  where id = p_booking_id
  for update skip locked;

  if not found then
    raise exception 'Booking not found or already being processed';
  end if;

  if b.status <> 'pending' then
    raise exception 'Booking already taken';
  end if;

  -- Check if worker matches service and community
  if not (b.service_type = any(w.service_types)) then
    raise exception 'Worker not eligible for this service type';
  end if;

  if not (b.community = any(w.communities) or b.community = w.community) then
    raise exception 'Worker not eligible for this community';
  end if;

  -- Accept the booking
  update bookings
  set worker_id = auth.uid(),
      worker_name = w.full_name,
      worker_phone = w.phone,
      worker_upi = w.upi_id,
      worker_photo_url = w.photo_url,
      status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = p_booking_id
  returning * into b;

  -- Mark worker as busy
  update workers
  set is_busy = true,
      last_active_at = now(),
      updated_at = now()
  where id = auth.uid();

  return b;
end;
$$;