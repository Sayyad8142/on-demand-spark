-- Enable realtime for bookings table (REPLICA IDENTITY FULL ensures all columns are available in realtime updates)
ALTER TABLE bookings REPLICA IDENTITY FULL;