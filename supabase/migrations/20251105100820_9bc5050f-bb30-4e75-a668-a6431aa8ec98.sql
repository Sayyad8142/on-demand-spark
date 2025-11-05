-- Add geofencing columns to communities table
ALTER TABLE communities 
ADD COLUMN IF NOT EXISTS center_lat double precision,
ADD COLUMN IF NOT EXISTS center_lng double precision,
ADD COLUMN IF NOT EXISTS radius_m integer DEFAULT 600;

-- Add location tracking columns to workers table
ALTER TABLE workers
ADD COLUMN IF NOT EXISTS selected_community_id uuid REFERENCES communities(id),
ADD COLUMN IF NOT EXISTS last_lat double precision,
ADD COLUMN IF NOT EXISTS last_lng double precision,
ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
ADD COLUMN IF NOT EXISTS location_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS in_geofence boolean DEFAULT false;

-- Create Haversine distance function (returns meters)
CREATE OR REPLACE FUNCTION public.haversine_m(
  lat1 double precision, 
  lng1 double precision,
  lat2 double precision, 
  lng2 double precision
) 
RETURNS double precision 
LANGUAGE sql 
IMMUTABLE 
AS $$
  SELECT 2 * 6371000 * asin(
    sqrt(
      sin(radians((lat2 - lat1)/2))^2 +
      cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lng2 - lng1)/2))^2
    )
  );
$$;

-- Update RLS for workers: allow workers to update their own location data
CREATE POLICY "Workers can update own location" ON workers
  FOR UPDATE
  USING (auth.uid() = id OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = id OR auth.uid() = user_id);

-- Function to update worker location with geofence hysteresis
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
  v_distance double precision;
  v_current_in_geofence boolean;
  v_new_in_geofence boolean;
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

  -- Get community center coordinates
  SELECT center_lat, center_lng
  INTO v_center_lat, v_center_lng
  FROM communities
  WHERE id = v_community_id;

  IF v_center_lat IS NULL OR v_center_lng IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Community center not configured');
  END IF;

  -- Calculate distance
  v_distance := haversine_m(p_lat, p_lng, v_center_lat, v_center_lng);

  -- Apply hysteresis: enter ≤120m, exit ≥180m
  IF v_distance <= 120 THEN
    v_new_in_geofence := true;
  ELSIF v_distance >= 180 THEN
    v_new_in_geofence := false;
  ELSE
    -- Between 120-180m: keep current state (hysteresis)
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
    'distance', v_distance,
    'threshold_enter', 120,
    'threshold_exit', 180
  );
END;
$$;