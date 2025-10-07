-- ============================================
-- TEST: Complete Worker Notification Flow
-- ============================================
-- This SQL will:
-- 1. Create a test worker
-- 2. Create a test booking (triggers notification flow)
-- 3. Verify the trigger fires and workers receive notifications

-- Step 1: Create a test worker if not exists
-- Replace the phone number and details as needed
DO $$
DECLARE
  test_worker_id uuid;
BEGIN
  -- Insert or get test worker
  INSERT INTO workers (
    id,
    full_name,
    phone,
    upi_id,
    service_types,
    communities,
    community,
    is_active,
    is_available,
    is_busy
  ) VALUES (
    '00000000-0000-0000-0000-000000000001', -- Fixed UUID for testing
    'Test Worker',
    '9876543210',
    'testworker@upi',
    ARRAY['maid', 'cook', 'bathroom_cleaning']::text[],
    ARRAY['prestige-high-fields']::text[],
    'prestige-high-fields',
    true,  -- active
    true,  -- available
    false  -- not busy
  )
  ON CONFLICT (id) DO UPDATE SET
    is_active = true,
    is_available = true,
    is_busy = false;
    
  RAISE NOTICE 'Test worker created/updated: 00000000-0000-0000-0000-000000000001';
END $$;

-- Step 2: Create a test booking (this will trigger the notification flow)
-- The trigger on_booking_created_notify_workers will:
-- - Call booking-notifications edge function
-- - Which finds eligible workers
-- - Which calls send-onesignal edge function
-- - Which sends OneSignal push to workers

INSERT INTO bookings (
  service_type,
  booking_type,
  status,
  cust_name,
  cust_phone,
  community,
  flat_no,
  price_inr,
  user_id
) VALUES (
  'maid',              -- service_type
  'instant',           -- booking_type
  'pending',           -- status (triggers notification)
  'Test Customer',     -- cust_name
  '1234567890',       -- cust_phone
  'prestige-high-fields', -- community
  'A-101',            -- flat_no
  500,                -- price_inr
  '00000000-0000-0000-0000-000000000001' -- user_id (same as test worker for simplicity)
)
RETURNING id, service_type, community, status;

-- Step 3: Check edge function logs
-- After running this SQL:
-- 1. Go to Supabase Dashboard > Edge Functions
-- 2. Check logs for 'booking-notifications' function
-- 3. You should see logs like:
--    📥 booking-notifications invoked
--    🔍 Loading booking: <booking-id>
--    ✅ Booking loaded: { service_type: 'maid', community: 'prestige-high-fields' }
--    🔍 Finding eligible workers...
--    ✅ Found 1 eligible workers: Test Worker
--    📤 Calling send-onesignal for workers: [...]
--    ✅ OneSignal notifications sent successfully

-- 4. Check logs for 'send-onesignal' function
-- 5. You should see logs like:
--    📥 send-onesignal invoked
--    📦 Request body: { "externalUserIds": [...], "data": { "type": "BOOKING_ALERT", ... } }
--    🔔 OneSignal payload: { "app_id": "...", "include_external_user_ids": [...] }
--    ✅ OneSignal notification sent successfully

-- Step 4: On Android device
-- If you have the app installed and logged in as the test worker:
-- 1. You should receive a push notification
-- 2. BookingNotificationService should intercept it (check logcat)
-- 3. BookingOverlayService should show the overlay
-- 4. You can tap Accept/Reject to update the booking

-- Step 5: Clean up test data (optional)
-- DELETE FROM bookings WHERE cust_name = 'Test Customer';
-- DELETE FROM workers WHERE phone = '9876543210';

-- ============================================
-- Expected Results:
-- ============================================
-- ✅ Trigger fires on INSERT
-- ✅ booking-notifications finds eligible workers
-- ✅ send-onesignal sends push with correct data structure:
--    {
--      "type": "BOOKING_ALERT",
--      "bookingId": "<uuid>",
--      "customer": "Test Customer",
--      "community": "prestige-high-fields",
--      "serviceType": "maid"
--    }
-- ✅ Android overlay appears (if app installed)
-- ✅ Web modal appears (if using web app)
-- ✅ Worker can Accept/Reject via try_accept_booking RPC
