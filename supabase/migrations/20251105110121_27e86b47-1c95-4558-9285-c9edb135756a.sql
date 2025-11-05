-- Add geofence coordinates for Prestige High Fields
-- Coordinates: Prestige High Fields, Sarjapur Road, Bangalore
UPDATE communities 
SET 
  center_lat = 12.914515,
  center_lng = 77.653812,
  radius_m = 600
WHERE name = 'Prestige High Fields' AND center_lat IS NULL;