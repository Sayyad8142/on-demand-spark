-- Upsert demo worker for Play Store reviewers
INSERT INTO public.workers (
  id,
  full_name,
  phone,
  service_types,
  communities,
  is_active,
  is_available,
  is_busy
) VALUES (
  gen_random_uuid(),
  'Demo Partner',
  '+919999999999',
  ARRAY['maid']::text[],
  ARRAY['Prestige High Fields']::text[],
  true,
  false,
  false
)
ON CONFLICT (phone) 
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  service_types = EXCLUDED.service_types,
  communities = EXCLUDED.communities,
  is_active = EXCLUDED.is_active;