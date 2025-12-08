-- Add cook_cuisine_tags column to workers table
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS cook_cuisine_tags text[] NOT NULL DEFAULT '{}'::text[];

-- Add comment for documentation
COMMENT ON COLUMN public.workers.cook_cuisine_tags IS 'Cook cuisine specialization tags: north_indian, south_indian, or both';