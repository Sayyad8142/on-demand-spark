
DO $$
BEGIN
  -- Normalize all worker phones to +91XXXXXXXXXX
  UPDATE public.workers
  SET phone = '+91' || RIGHT(regexp_replace(phone, '\D', '', 'g'), 10)
  WHERE phone IS NOT NULL;
END $$;
