-- Create app_config table for force update system
CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_worker_version_code INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert initial configuration
INSERT INTO public.app_config (min_worker_version_code)
VALUES (1);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read app_config
CREATE POLICY "app_config_authenticated_read"
ON public.app_config
FOR SELECT
TO authenticated
USING (true);