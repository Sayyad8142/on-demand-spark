-- ============================================================================
-- SECURITY FIX: Issue #1 - Implement proper RBAC with user_roles table
-- ============================================================================

-- Step 1: Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'worker', 'customer');

-- Step 2: Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Step 4: Migrate existing admin users from profiles.is_admin to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM public.profiles
WHERE is_admin = true
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 5: Update is_admin() function to use user_roles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- Step 6: Drop the protect_is_admin trigger and function (no longer needed)
DROP TRIGGER IF EXISTS protect_is_admin_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_is_admin();

-- Step 7: Remove is_admin column from profiles (keep the data for rollback if needed, drop later)
-- ALTER TABLE public.profiles DROP COLUMN is_admin; -- Commented for safety, uncomment after verification

-- Step 8: Add RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- SECURITY FIX: Issue #2 - Remove worker contact details from bookings
-- ============================================================================

-- Step 1: Create secure RPC function to get worker contact info
CREATE OR REPLACE FUNCTION public.get_worker_contact(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_worker record;
BEGIN
  -- Get booking details with lock
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR SHARE;

  -- Security checks
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  -- Only allow access if:
  -- 1. User is the customer who created the booking
  -- 2. User is the assigned worker
  -- 3. User is admin
  IF NOT (
    v_booking.user_id = auth.uid() OR
    v_booking.worker_id = auth.uid() OR
    public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Only reveal contact info for active/confirmed bookings
  IF v_booking.status NOT IN ('assigned', 'accepted', 'on_the_way', 'started', 'completed') THEN
    RETURN jsonb_build_object('error', 'Booking not active');
  END IF;

  -- Get worker details
  SELECT * INTO v_worker
  FROM public.workers
  WHERE id = v_booking.worker_id;

  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Worker not found');
  END IF;

  -- Return worker contact info with masking for pending confirmation
  RETURN jsonb_build_object(
    'worker_name', v_worker.full_name,
    'worker_phone', CASE 
      WHEN v_booking.confirmed_at IS NOT NULL THEN v_worker.phone
      ELSE 'XXXX' || RIGHT(v_worker.phone, 4)
    END,
    'worker_upi', CASE
      WHEN v_booking.status IN ('completed') THEN v_worker.upi_id
      ELSE NULL
    END,
    'worker_photo_url', v_worker.photo_url
  );
END;
$$;

-- Step 2: Drop the trigger that copies worker data to bookings
DROP TRIGGER IF EXISTS copy_worker_trigger ON public.bookings;

-- Step 3: Update copy_worker_into_booking to NOT copy contact details
CREATE OR REPLACE FUNCTION public.copy_worker_into_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE 
  w public.workers;
BEGIN
  -- Only process if worker_id is being set or changed
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    IF NEW.worker_id IS NULL THEN
      -- Clear worker data if unassigned
      NEW.worker_name := NULL; 
      NEW.worker_phone := NULL; 
      NEW.worker_upi := NULL; 
      NEW.worker_photo_url := NULL;
    ELSE
      -- Only copy name and photo, NOT phone or UPI
      SELECT * INTO w FROM public.workers WHERE id = NEW.worker_id;
      IF FOUND THEN
        NEW.worker_name := w.full_name;
        NEW.worker_photo_url := w.photo_url;
        -- Explicitly set contact fields to NULL for security
        NEW.worker_phone := NULL;
        NEW.worker_upi := NULL;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate trigger
CREATE TRIGGER copy_worker_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.copy_worker_into_booking();

-- Step 4: Add columns to track contact info access (audit trail)
CREATE TABLE IF NOT EXISTS public.worker_contact_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  accessed_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

ALTER TABLE public.worker_contact_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access logs"
ON public.worker_contact_access_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Step 5: Clear existing sensitive data from bookings (optional - comment out if you want to keep for reference)
-- UPDATE public.bookings SET worker_phone = NULL, worker_upi = NULL WHERE worker_phone IS NOT NULL;

COMMENT ON FUNCTION public.get_worker_contact IS 'Securely returns worker contact info only for active bookings with proper authorization';
COMMENT ON TABLE public.worker_contact_access_log IS 'Audit trail for worker contact information access';