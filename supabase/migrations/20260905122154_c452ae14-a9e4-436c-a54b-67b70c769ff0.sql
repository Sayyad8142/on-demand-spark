ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS building_name text;

CREATE OR REPLACE FUNCTION public.set_booking_building_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.building_name IS NOT NULL AND btrim(NEW.building_name) <> '' THEN
    RETURN NEW;
  END IF;

  -- 1) Customer profile's selected building/block
  SELECT b.name INTO v_name
  FROM public.profiles p
  JOIN public.buildings b ON b.id = p.building_id
  WHERE (p.id::text = NEW.user_id::text OR p.firebase_uid = NEW.user_id::text)
  LIMIT 1;

  -- 2) Fallback: flats registry for this community + flat number
  IF v_name IS NULL THEN
    SELECT b.name INTO v_name
    FROM public.flats f
    JOIN public.buildings b ON b.id = f.building_id
    JOIN public.communities c ON c.id = f.community_id
    WHERE f.flat_no = NEW.flat_no
      AND (c.value = NEW.community OR c.name = NEW.community)
    LIMIT 1;
  END IF;

  NEW.building_name := v_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_building_name ON public.bookings;
CREATE TRIGGER trg_set_booking_building_name
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_booking_building_name();

-- Backfill existing bookings
UPDATE public.bookings bk
SET building_name = b.name
FROM public.profiles p
JOIN public.buildings b ON b.id = p.building_id
WHERE bk.building_name IS NULL
  AND (p.id::text = bk.user_id::text OR p.firebase_uid = bk.user_id::text);

UPDATE public.bookings bk
SET building_name = b.name
FROM public.flats f
JOIN public.buildings b ON b.id = f.building_id
JOIN public.communities c ON c.id = f.community_id
WHERE bk.building_name IS NULL
  AND f.flat_no = bk.flat_no
  AND (c.value = bk.community OR c.name = bk.community);

DROP FUNCTION IF EXISTS public.get_community_types();
CREATE FUNCTION public.get_community_types()
RETURNS TABLE (id uuid, name text, value text, community_type text, flat_format text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.value,
         COALESCE(c.community_type, 'apartment')::text,
         COALESCE(c.flat_format, 'standard')::text
  FROM public.communities c
$$;

GRANT EXECUTE ON FUNCTION public.get_community_types() TO anon, authenticated, service_role;