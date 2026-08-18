DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'bookings' AND column_name = 'otp_verified') THEN
        ALTER TABLE public.bookings ADD COLUMN otp_verified boolean DEFAULT false;
    END IF;
END $$;

-- Backfill otp_verified based on otp_verified_at
UPDATE public.bookings SET otp_verified = true WHERE otp_verified_at IS NOT NULL;
