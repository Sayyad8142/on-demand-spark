-- Fix update_worker_location to use community radius_m instead of hardcoded 120m/180m
CREATE OR REPLACE FUNCTION public.update_worker_location(
  p_lat double precision,
  p_lng double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_worker_id uuid;
  v_community_id uuid;
  v_center_lat double precision;
  v_center_lng double precision;
  v_radius_m integer;
  v_distance double precision;
  v_current_in_geofence boolean;
  v_new_in_geofence boolean;
  v_enter_threshold double precision;
  v_exit_threshold double precision;
BEGIN
  v_worker_id := auth.uid();
  
  IF v_worker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get worker's selected community and current geofence state
  SELECT selected_community_id, in_geofence 
  INTO v_community_id, v_current_in_geofence
  FROM workers 
  WHERE id = v_worker_id;

  IF v_community_id IS NULL THEN
    -- No community selected, just update location
    UPDATE workers
    SET last_lat = p_lat,
        last_lng = p_lng,
        last_seen_at = now(),
        location_enabled = true,
        in_geofence = false
    WHERE id = v_worker_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'in_geofence', false,
      'distance', null,
      'message', 'No community selected'
    );
  END IF;

  -- Get community center coordinates and radius
  SELECT center_lat, center_lng, COALESCE(radius_m, 100)
  INTO v_center_lat, v_center_lng, v_radius_m
  FROM communities
  WHERE id = v_community_id;

  IF v_center_lat IS NULL OR v_center_lng IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Community center not configured');
  END IF;

  -- Calculate distance
  v_distance := haversine_m(p_lat, p_lng, v_center_lat, v_center_lng);

  -- Apply hysteresis based on community radius:
  -- Enter threshold: radius_m (e.g., 600m for Prestige High Fields)
  -- Exit threshold: radius_m + 50m (e.g., 650m - adds buffer to prevent flapping)
  v_enter_threshold := v_radius_m;
  v_exit_threshold := v_radius_m + 50;

  IF v_distance <= v_enter_threshold THEN
    v_new_in_geofence := true;
  ELSIF v_distance >= v_exit_threshold THEN
    v_new_in_geofence := false;
  ELSE
    -- Between thresholds: keep current state (hysteresis)
    v_new_in_geofence := COALESCE(v_current_in_geofence, false);
  END IF;

  -- Update worker location
  UPDATE workers
  SET last_lat = p_lat,
      last_lng = p_lng,
      last_seen_at = now(),
      location_enabled = true,
      in_geofence = v_new_in_geofence
  WHERE id = v_worker_id;

  RETURN jsonb_build_object(
    'success', true,
    'in_geofence', v_new_in_geofence,
    'distance', ROUND(v_distance::numeric, 1),
    'threshold_enter', v_enter_threshold,
    'threshold_exit', v_exit_threshold
  );
END;
$$;

-- Update Prestige High Fields to correct coordinates (near Hyderabad based on worker location)
-- Using coordinates near the worker's current location: 17.414, 78.340
UPDATE communities 
SET 
  center_lat = 17.4144522,
  center_lng = 78.3401467,
  radius_m = 600
WHERE name = 'Prestige High Fields';