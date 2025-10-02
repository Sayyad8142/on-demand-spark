-- Drop the old status check constraint
ALTER TABLE public.bookings 
DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Create updated status check constraint with all valid statuses including 'accepted'
ALTER TABLE public.bookings 
ADD CONSTRAINT bookings_status_check 
CHECK (status IN (
  'pending',
  'assigned', 
  'accepted',
  'on_the_way',
  'started',
  'completed',
  'cancelled'
));