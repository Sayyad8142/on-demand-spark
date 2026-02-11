-- Add a validation trigger to reject cook bookings
CREATE OR REPLACE FUNCTION public.validate_booking_service_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.service_type NOT IN ('maid', 'bathroom_cleaning') THEN
    RAISE EXCEPTION 'Service not supported: %. Only maid and bathroom_cleaning are available.', NEW.service_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS validate_booking_service_type_trigger ON public.bookings;
CREATE TRIGGER validate_booking_service_type_trigger
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_service_type();

-- Auto-convert existing cook workers to maid
UPDATE public.workers 
SET service_types = array_remove(service_types, 'cook'),
    cook_cuisine_tags = '{}'::text[],
    updated_at = now()
WHERE 'cook' = ANY(service_types);

-- If any worker has empty service_types after cook removal, default to maid
UPDATE public.workers 
SET service_types = ARRAY['maid'],
    updated_at = now()
WHERE service_types = '{}' OR service_types IS NULL;