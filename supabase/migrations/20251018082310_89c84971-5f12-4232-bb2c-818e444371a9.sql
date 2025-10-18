-- Fix worker busy status management
-- Problem: Workers get marked as busy but never reset, blocking all notifications

-- First, reset all workers who are stuck in busy state
UPDATE workers 
SET is_busy = false 
WHERE is_busy = true 
  AND NOT EXISTS (
    SELECT 1 FROM bookings 
    WHERE bookings.worker_id = workers.id 
      AND bookings.status IN ('assigned', 'accepted', 'on_the_way', 'started')
  );

-- Create function to auto-reset worker busy status when booking completes
CREATE OR REPLACE FUNCTION auto_reset_worker_busy_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When a booking moves to completed or cancelled, mark worker as not busy
  IF NEW.status IN ('completed', 'cancelled') AND OLD.status NOT IN ('completed', 'cancelled') THEN
    IF NEW.worker_id IS NOT NULL THEN
      UPDATE workers 
      SET is_busy = false 
      WHERE id = NEW.worker_id;
      
      RAISE NOTICE 'Worker % marked as not busy (booking % -> %)', NEW.worker_id, OLD.status, NEW.status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS trigger_auto_reset_worker_busy ON bookings;
CREATE TRIGGER trigger_auto_reset_worker_busy
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION auto_reset_worker_busy_status();

-- Log the fix
DO $$
DECLARE
  reset_count INT;
BEGIN
  SELECT COUNT(*) INTO reset_count FROM workers WHERE is_busy = false AND is_active = true AND is_available = true;
  RAISE NOTICE 'Reset busy status. Available workers now: %', reset_count;
END $$;