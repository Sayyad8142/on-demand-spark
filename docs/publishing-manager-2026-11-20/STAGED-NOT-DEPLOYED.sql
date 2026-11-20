-- STAGED — NOT DEPLOYED. Requires owner approval before applying to production.
-- Receiver for Worker App release-status reports (Admin Publishing Manager).
-- Reports are written by an admin session (Admin Dashboard or a CI job acting for an admin).
-- The Worker App never calls these functions and holds no publishing credentials.

CREATE TABLE IF NOT EXISTS public.app_release_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL CHECK (app IN ('worker')),
  platform text NOT NULL CHECK (platform IN ('android')),
  version_name text,
  version_code integer CHECK (version_code IS NULL OR version_code > 0),
  next_version_name text,
  next_version_code integer CHECK (next_version_code IS NULL OR next_version_code > 0),
  report jsonb NOT NULL,
  submitted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_release_reports TO service_role;
ALTER TABLE public.app_release_reports ENABLE ROW LEVEL SECURITY;
-- No client policies: access only through the admin-checked functions below.

CREATE OR REPLACE FUNCTION public.admin_submit_app_release_report(_report jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_report) <> 'object' OR (_report->>'contract_version') IS DISTINCT FROM '1'
     OR _report->>'app' IS DISTINCT FROM 'worker' OR _report->>'platform' IS DISTINCT FROM 'android' THEN
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '22023';
  END IF;
  IF octet_length(_report::text) > 65536 THEN RAISE EXCEPTION 'report_too_large' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.app_release_reports(app, platform, version_name, version_code, next_version_name, next_version_code, report, submitted_by)
  VALUES ('worker', 'android',
    _report#>>'{current_version,name}', NULLIF(_report#>>'{current_version,code}','')::int,
    _report#>>'{next_version,name}', NULLIF(_report#>>'{next_version,code}','')::int,
    -- store/production/mandatory fields are server-owned: never trusted from the report.
    _report - 'store_upload_status' - 'production_availability' - 'mandatory_update_status',
    auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_submit_app_release_report(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_submit_app_release_report(jsonb) TO authenticated;

-- Latest reports plus server-owned store and mandatory-update state from app_update_configs.
CREATE OR REPLACE FUNCTION public.admin_worker_release_status(_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'policy', (SELECT jsonb_build_object(
        'latest_version', c.latest_version, 'latest_build', c.latest_build, 'min_build', c.min_build,
        'mode', c.mode, 'is_active', c.is_active,
        'store_verified_version', c.store_verified_version, 'store_verified_at', c.store_verified_at,
        'mandatory_effective', c.is_active AND c.mode = 'force' AND c.store_verified_version = c.latest_version)
      FROM app_update_configs c WHERE c.app = 'worker' AND c.platform = 'android'),
    'reports', COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at DESC) FROM (
        SELECT id, version_name, version_code, next_version_name, next_version_code, report, created_at
        FROM app_release_reports WHERE app = 'worker' AND platform = 'android'
        ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50)) r), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_worker_release_status(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_worker_release_status(integer) TO authenticated;
