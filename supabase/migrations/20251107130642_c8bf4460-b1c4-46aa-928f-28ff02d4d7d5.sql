-- Fix worker_availability slots column type
-- Change from boolean[] to text[] to store time slots

ALTER TABLE worker_availability 
ALTER COLUMN slots TYPE text[] USING slots::text[];