-- Backfill selected_community_id for existing workers based on their communities array
-- This ensures workers created before the fix can receive booking notifications

UPDATE workers w
SET selected_community_id = c.id
FROM communities c
WHERE w.selected_community_id IS NULL
  AND w.communities IS NOT NULL
  AND array_length(w.communities, 1) > 0
  AND c.value = w.communities[1];