CREATE OR REPLACE FUNCTION public.set_booking_building_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_format text;
BEGIN
  SELECT COALESCE(c.flat_format, 'standard') INTO v_format
  FROM public.communities c
  WHERE c.value = NEW.community OR c.name = NEW.community
  LIMIT 1;

  -- Tower-encoded communities (PHF): tower comes from flat_no, never a block.
  IF COALESCE(v_format, 'standard') = 'standard' THEN
    NEW.building_name := NULL;
    RETURN NEW;
  END IF;

  IF NEW.building_name IS NOT NULL AND btrim(NEW.building_name) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT b.name INTO v_name
  FROM public.profiles p
  JOIN public.buildings b ON b.id = p.building_id
  WHERE (p.id::text = NEW.user_id::text OR p.firebase_uid = NEW.user_id::text)
  LIMIT 1;

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

-- Clear values wrongly backfilled onto tower-encoded communities
UPDATE public.bookings bk
SET building_name = NULL
FROM public.communities c
WHERE bk.building_name IS NOT NULL
  AND (c.value = bk.community OR c.name = bk.community)
  AND COALESCE(c.flat_format, 'standard') = 'standard';