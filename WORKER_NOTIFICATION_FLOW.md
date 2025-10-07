# 🔔 Worker Notification & Acceptance Flow

## Complete End-to-End Implementation

### 📋 Overview

This document describes the complete worker notification system that alerts workers about new bookings and allows them to accept/reject via system overlay or web modal.

---

## 🔄 Flow Diagram

```
User Creates Booking (pending)
         ↓
[DB Trigger: on_booking_created_notify_workers]
         ↓
Edge Function: booking-notifications
  - Finds eligible workers (active, available, matching service/community)
  - Ranks by rating
         ↓
Edge Function: send-onesignal
  - Sends push notification via OneSignal
  - Data: { type: "BOOKING_ALERT", bookingId, customer, community, serviceType }
  - Target: include_external_user_ids (worker Supabase user IDs)
         ↓
    ┌────────────────────┴────────────────────┐
    │                                         │
[ANDROID PATH]                          [WEB PATH]
    │                                         │
BookingNotificationService.kt         useBookingAlerts.ts
(intercepts push)                     (realtime subscription)
    │                                         │
BookingOverlayService.kt              BookingAlertModal.tsx
(shows system overlay)                (shows modal)
    │                                         │
    └────────────────────┬────────────────────┘
                         ↓
              Worker Accepts/Rejects
                         ↓
         ┌──────────────┴──────────────┐
         │                             │
    [Accept]                      [Reject]
         │                             │
RPC: try_accept_booking         PATCH /bookings
  - Validates eligibility       (status = cancelled)
  - Updates booking
  - Marks worker busy
  - Returns success/error
```

---

## 🗄️ Database Components

### 1. Trigger: `on_booking_created_notify_workers`

**Purpose:** Automatically calls the `booking-notifications` edge function when a new booking is created with status 'pending'

**Location:** Runs on `INSERT` to `bookings` table

**Function:** `trigger_booking_notification()`

```sql
CREATE TRIGGER on_booking_created_notify_workers
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_booking_notification();
```

---

### 2. RPC: `try_accept_booking(p_booking_id uuid)`

**Purpose:** Securely handles worker acceptance with proper validation

**Security:**
- Uses `SECURITY DEFINER` - runs with elevated privileges
- Validates worker eligibility (service type, community match)
- Implements row-level locking to prevent race conditions
- Checks booking status (must be 'pending')

**Returns:** 
```json
{
  "success": true/false,
  "booking_id": "uuid",
  "error": "error message if failed"
}
```

**What it does:**
1. Gets authenticated worker details
2. Locks booking row (prevents double-booking)
3. Validates worker is active & available
4. Validates service type & community match
5. Updates booking with worker details
6. Marks worker as busy
7. Returns success or specific error message

---

### 3. RPC: `worker_set_booking_status(booking_id_param uuid, new_status_param text)`

**Purpose:** Allows workers to update job status during execution

**Valid transitions:**
- `assigned` → `started`
- `assigned` → `completed`
- `started` → `completed`

---

## 📡 Edge Functions

### 1. `booking-notifications`

**Trigger:** Called by database trigger on new pending bookings

**Process:**
1. **Load Booking** - Validates status is 'pending'
2. **Find Eligible Workers:**
   - `is_active = true`
   - `is_available = true`
   - `is_busy = false`
   - Service type matches
   - Community matches
3. **Call send-onesignal** with worker IDs

**Logging:**
```
📥 booking-notifications invoked
🔍 Loading booking: <uuid>
✅ Booking loaded: { service_type, community }
🔍 Finding eligible workers...
✅ Found N eligible workers: [names]
📤 Calling send-onesignal for workers: [ids]
✅ OneSignal notifications sent successfully
```

---

### 2. `send-onesignal`

**Trigger:** Called by `booking-notifications` function

**Process:**
1. Receives worker IDs and notification data
2. Calls OneSignal API with proper structure
3. Returns success/error

**Payload Structure:**
```json
{
  "externalUserIds": ["worker-uuid-1", "worker-uuid-2"],
  "headings": { "en": "New Booking Alert!" },
  "contents": { "en": "Maid booking in Prestige High Fields. Tap to accept!" },
  "data": {
    "type": "BOOKING_ALERT",
    "bookingId": "uuid",
    "customer": "Customer Name",
    "community": "prestige-high-fields",
    "serviceType": "maid"
  }
}
```

**Logging:**
```
📥 send-onesignal invoked
📦 Request body: {...}
📤 Sending to N users: [ids]
🔔 OneSignal payload: {...}
✅ OneSignal notification sent successfully
```

---

## 📱 Android Implementation

### 1. OneSignal Initialization

**File:** `src/lib/onesignal.ts`

**Key Functions:**
- `OneSignal.initialize(APP_ID)` - Initialize SDK
- `OneSignal.login(userId)` - Link device to Supabase user ID
- `OneSignal.User.addTag('role', 'worker')` - Tag as worker

**Called:** On app launch after user authentication

---

### 2. Notification Interception

**File:** `BookingNotificationService.kt`

**Purpose:** Intercepts OneSignal notifications with type "BOOKING_ALERT"

**Process:**
1. Checks notification data for `type = "BOOKING_ALERT"`
2. Extracts booking details (ID, customer, community, service)
3. Starts `BookingOverlayService` with booking data
4. Creates fallback full-screen notification
5. Calls `event.preventDefault()` to suppress OneSignal's default notification

---

### 3. System Overlay

**File:** `BookingOverlayService.kt`

**Purpose:** Shows system-level alert that appears over all apps

**UI:** Inflates `overlay_booking_alert.xml`

**Actions:**
- **Accept Button:** Calls `try_accept_booking` RPC
- **Reject Button:** Updates booking status to 'cancelled'

**Permissions Required:**
- `SYSTEM_ALERT_WINDOW` (requested via `OverlayPermissionHelper.kt`)

**Window Type:**
- Android 8+: `TYPE_APPLICATION_OVERLAY`
- Android <8: `TYPE_SYSTEM_ALERT`

---

### 4. Permission Management

**File:** `OverlayPermissionHelper.kt`

**Functions:**
- `canDraw(activity)` - Check if permission granted
- `request(activity)` - Open system settings to grant permission
- Called from `MainActivity.kt` and `App.tsx`

---

## 🌐 Web Implementation

### 1. Realtime Subscription

**File:** `useBookingAlerts.ts`

**Purpose:** Subscribes to new pending bookings via Supabase Realtime

**Process:**
1. Subscribes to `postgres_changes` on `bookings` table
2. Filters for `status = 'pending'`
3. Validates booking matches worker's service/community
4. Sets `pendingBooking` state

```typescript
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'bookings',
  filter: 'status=eq.pending'
}, async (payload) => {
  // Validate worker eligibility
  // Set pendingBooking if match
})
```

---

### 2. Alert Modal

**File:** `BookingAlertModal.tsx`

**Features:**
- 30-second countdown timer
- Audio alert with user activation
- Wake lock to keep screen on
- Sticky browser notification
- Booking details display

**Actions:**
- **Accept:** Calls `try_accept_booking` RPC
- **Reject:** Clears alert and shows toast

**Effects:**
- Starts alert overlay (audio + vibration)
- Shows sticky notification (requires user interaction to dismiss)
- Auto-rejects after 30 seconds

---

## 🔐 Security & Validation

### Row-Level Security (RLS)

**bookings table:**
- Workers can SELECT pending bookings matching their service/community
- Workers can UPDATE bookings they're assigned to
- Admins have full access

**workers table:**
- Workers can SELECT their own profile
- Workers can UPDATE their own availability
- Admins have full access

---

### RPC Security

**try_accept_booking:**
- Uses `SECURITY DEFINER` with `search_path = 'public'`
- Validates worker is authenticated (`auth.uid()`)
- Validates worker is active and available
- Validates service type match
- Validates community match
- Implements row-level locking (`FOR UPDATE`)
- Returns specific error messages

---

## 🧪 Testing

### Test Flow

Run `TEST_BOOKING_FLOW.sql`:

1. **Creates test worker:**
   - ID: `00000000-0000-0000-0000-000000000001`
   - Services: maid, cook, bathroom_cleaning
   - Community: prestige-high-fields
   - Status: active, available, not busy

2. **Creates test booking:**
   - Service: maid
   - Community: prestige-high-fields
   - Status: pending (triggers notification)

3. **Check logs:**
   - Supabase Dashboard → Edge Functions
   - View `booking-notifications` logs
   - View `send-onesignal` logs

4. **Expected on device:**
   - Push notification received
   - Overlay appears over all apps
   - Can accept/reject

---

## 📊 Logging & Debugging

### Edge Function Logs

**Access:** Supabase Dashboard → Edge Functions → View Logs

**Key Events:**
- `📥 booking-notifications invoked`
- `✅ Found N eligible workers`
- `📤 Calling send-onesignal`
- `✅ OneSignal notifications sent`

---

### Android Logs (Logcat)

**Filter by:** `BookingNotificationService`, `BookingOverlayService`

**Key Events:**
```
D/BookingNotificationService: Intercepted BOOKING_ALERT
D/BookingNotificationService: Starting overlay service
D/BookingOverlay: Showing overlay for booking: <id>
D/BookingOverlay: 📤 Updating booking with action: accepted
D/BookingOverlay: ✅ RPC response: 200
```

---

### Web Console Logs

**Key Events:**
```
🔔 Initializing OneSignal for native platform...
🔗 Linking OneSignal to user: <uuid>
✅ OneSignal linked with user: <uuid>
🔔 OneSignal notification clicked
📬 Booking alert detected, posting message: <bookingId>
```

---

## 🚀 Deployment Checklist

- [x] Database trigger created: `on_booking_created_notify_workers`
- [x] RPC created: `try_accept_booking`
- [x] RPC created: `worker_set_booking_status`
- [x] Edge function deployed: `booking-notifications`
- [x] Edge function deployed: `send-onesignal`
- [x] OneSignal initialized with user linking
- [x] Android notification service implemented
- [x] Android overlay service implemented
- [x] Overlay permissions requested
- [x] Web booking alerts implemented
- [x] Web modal with accept/reject implemented
- [x] Test SQL provided
- [x] Logging added throughout

---

## 🔑 Environment Variables

**Required in Supabase Edge Functions:**
- `ONESIGNAL_APP_ID` - OneSignal application ID
- `ONESIGNAL_REST_API_KEY` - OneSignal REST API key

**Set in:** Supabase Dashboard → Edge Functions → Secrets

---

## 📝 Next Steps

1. Run `TEST_BOOKING_FLOW.sql` to verify end-to-end flow
2. Check edge function logs for success messages
3. Test on Android device (if available)
4. Test on web app
5. Verify worker can accept/reject bookings
6. Monitor logs for any errors

---

## 🐛 Troubleshooting

### No notification received?
1. Check edge function logs - did trigger fire?
2. Verify worker is active, available, not busy
3. Check service type and community match
4. Verify OneSignal credentials configured
5. Check worker's phone has push enabled

### Overlay not showing on Android?
1. Check SYSTEM_ALERT_WINDOW permission granted
2. Check logcat for errors
3. Verify BookingNotificationService intercepted notification
4. Verify BookingOverlayService started

### Accept button not working?
1. Check edge function logs for RPC errors
2. Verify worker authentication
3. Check booking is still pending
4. Verify service/community match

---

## 📚 Related Files

- `supabase/functions/booking-notifications/index.ts`
- `supabase/functions/send-onesignal/index.ts`
- `src/lib/onesignal.ts`
- `src/hooks/useBookingAlerts.ts`
- `src/components/BookingAlertModal.tsx`
- `android/app/src/main/java/.../BookingNotificationService.kt`
- `android/app/src/main/java/.../BookingOverlayService.kt`
- `android/app/src/main/java/.../OverlayPermissionHelper.kt`
- `android/app/src/main/res/layout/overlay_booking_alert.xml`
- `TEST_BOOKING_FLOW.sql`
