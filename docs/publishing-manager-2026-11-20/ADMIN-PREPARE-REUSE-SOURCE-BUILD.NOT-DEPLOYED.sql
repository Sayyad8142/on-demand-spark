-- NOT DEPLOYED. Needs owner approval. Only change vs hosted: the v_next calculation.
-- Lets Admin adopt the prepared source 10.0.04 (104) instead of forcing 105; otherwise unchanged.
CREATE OR REPLACE FUNCTION admin_private.admin_prepare_next_release(p_app text, p_platform text, p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_admin uuid := admin_private.release_require_admin(); b record; v_max_release int; v_next int; v_id uuid;
BEGIN
  SELECT * INTO b FROM app_release_baselines WHERE app = p_app AND platform = p_platform FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown app/platform'; END IF;
  IF b.highest_uploaded_build IS NULL THEN
    RAISE EXCEPTION 'Blocked: confirm the highest build number ever uploaded to the store first';
  END IF;
  IF b.live_store_version IS NULL THEN
    RAISE EXCEPTION 'Blocked: confirm the live store version first';
  END IF;
  IF admin_private.release_version_parts(p_version) IS NULL THEN
    RAISE EXCEPTION 'Version must look like 18.6 or 10.0.3';
  END IF;
  IF admin_private.release_version_parts(p_version) <= admin_private.release_version_parts(b.live_store_version) THEN
    RAISE EXCEPTION 'Version % must be higher than the live store version %', p_version, b.live_store_version;
  END IF;
  IF b.repo_version IS NOT NULL AND admin_private.release_version_parts(p_version) < admin_private.release_version_parts(b.repo_version) THEN
    RAISE EXCEPTION 'Version % is lower than the app source version %', p_version, b.repo_version;
  END IF;
  IF EXISTS (SELECT 1 FROM app_releases WHERE app = p_app AND platform = p_platform AND status IN ('draft','in_progress')) THEN
    RAISE EXCEPTION 'This app already has an open release. Finish or cancel it first';
  END IF;

  SELECT max(build_number) INTO v_max_release FROM app_releases WHERE app = p_app AND platform = p_platform;
  -- Reuse an already-prepared source build when it is above every uploaded, live and recorded build.
  v_next := CASE
    WHEN b.repo_build IS NOT NULL
     AND b.repo_build > greatest(b.highest_uploaded_build, coalesce(b.live_store_build, 0), coalesce(v_max_release, 0))
     AND b.repo_version IS NOT DISTINCT FROM p_version
    THEN b.repo_build
    ELSE greatest(b.highest_uploaded_build, coalesce(b.live_store_build, 0), coalesce(b.repo_build, 0), coalesce(v_max_release, 0)) + 1 END;

  INSERT INTO app_releases (app, platform, marketing_version, build_number, created_by)
  VALUES (p_app, p_platform, p_version, v_next, v_admin) RETURNING id INTO v_id;

  INSERT INTO app_release_phases (release_id, phase, status, evidence, source, updated_by)
  SELECT v_id, g, CASE WHEN g = 1 THEN 'passed' WHEN g = 2 THEN 'running' ELSE 'pending' END,
    CASE WHEN g = 1 THEN format('Live %s, highest uploaded build %s (%s), source %s/%s',
           b.live_store_version, b.highest_uploaded_build, coalesce(b.highest_uploaded_evidence,''),
           coalesce(b.repo_version,'unknown'), coalesce(b.repo_build::text,'unknown'))
         WHEN g = 2 THEN 'Draft created. Waiting for the app project to apply the version change.'
         ELSE '' END,
    CASE WHEN g <= 2 THEN 'system' ELSE 'system' END, v_admin
  FROM generate_series(1,7) g;

  INSERT INTO app_release_audit (release_id, app, platform, action, details, actor_id, actor_kind)
  VALUES (v_id, p_app, p_platform, 'release_prepared',
    jsonb_build_object('version', p_version, 'build', v_next, 'highest_uploaded', b.highest_uploaded_build,
      'live', b.live_store_version, 'live_build', b.live_store_build, 'repo', b.repo_version, 'repo_build', b.repo_build,
      'max_recorded_release_build', v_max_release),
    v_admin, 'admin');
  RETURN jsonb_build_object('id', v_id, 'version', p_version, 'build', v_next);
END $function$;
