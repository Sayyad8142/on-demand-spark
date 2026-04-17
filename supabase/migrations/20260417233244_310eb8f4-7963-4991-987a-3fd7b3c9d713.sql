-- Add per-community platform fee configuration
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);

COMMENT ON COLUMN public.communities.platform_fee_percent IS
  'Platform fee % deducted from gross booking amount before worker payout. 0 = worker keeps full amount. Admin-controlled, per-community.';

-- Helper used by edge functions and (optionally) frontend to resolve fee for any booking
CREATE OR REPLACE FUNCTION public.get_community_platform_fee_percent(_community TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT platform_fee_percent FROM public.communities
      WHERE value = _community OR name = _community
      LIMIT 1),
    0  -- Safe fallback: 0% if community not found / not configured
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_community_platform_fee_percent(TEXT) TO anon, authenticated, service_role;