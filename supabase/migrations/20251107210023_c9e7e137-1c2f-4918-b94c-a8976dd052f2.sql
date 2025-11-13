-- Modify the trigger to NOT send immediate notifications for scheduled bookings
-- Drop the existing trigger first
DROP TRIGGER IF EXISTS on_booking_created_notify_workers ON bookings;

-- Create updated function that checks if booking is scheduled
CREATE OR REPLACE FUNCTION public.notify_workers_on_booking_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Only send immediate notifications for instant bookings (no scheduled_date)
  -- Scheduled bookings will be handled by the cron job
  IF NEW.scheduled_date IS NULL THEN
    -- Call the booking-notifications edge function for instant bookings
    PERFORM net.http_post(
      url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/booking-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTE2OTI2OSwiZXhwIjoyMDcwNzQ1MjY5fQ.xZ7TTPwf_1MStOE6s0P7hXkpGIwwJP2K0vcx5wVqlI0'
      ),
      body := jsonb_build_object('booking_id', NEW.id::text)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_booking_created_notify_workers
AFTER INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION notify_workers_on_booking_created();

-- Create a cron job to check for scheduled bookings that need alerts
-- This will run every minute and send alerts 10 minutes before scheduled time
SELECT cron.schedule(
  'send-scheduled-booking-alerts',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/check-scheduled-bookings',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"}'::jsonb
    ) as request_id;
  $$
);