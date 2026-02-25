# Didi Now Worker App - Complete Developer Documentation

## 1. APP OVERVIEW

**Purpose**: Production-ready mobile app for workers providing on-demand services (maids, cooks, bathroom cleaning) in gated communities.

**Tech Stack**:
- **Frontend**: React 18.3.1 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components (hot pink #ff007a theme)
- **Mobile**: Capacitor 7.4.3 (Android/iOS)
- **Backend**: Supabase (PostgreSQL database, Edge Functions, Real-time subscriptions)
- **Routing**: React Router v6
- **State Management**: React hooks + TanStack Query
- **Push Notifications**: Firebase Cloud Messaging (FCM)

---

## 2. DATABASE SCHEMA

### Core Tables

#### `profiles`
- User profile information
- Fields: `id`, `full_name`, `phone`, `community`, `flat_no`, `is_admin`, `created_at`, `updated_at`
- RLS: Users can only read/update their own profile, admins can see all

#### `workers`
- Worker information and availability
- Fields: `id`, `full_name`, `phone`, `upi_id`, `service_types[]`, `community`, `communities[]`, `is_active`, `is_available`, `is_busy`, `fcm_token`, `rating`, `total_ratings`, `photo_url`, `last_active_at`
- Note: Workers are linked to auth users via `id` field
- RLS: Workers can update their own profile, admins have full access

#### `bookings`
- All booking records with complete workflow
- **Status Flow**: `pending` → `assigned` → `accepted` → `on_the_way` → `started` → `completed`
- Fields:
  - Basic: `id`, `user_id`, `worker_id`, `service_type`, `booking_type` (instant/scheduled)
  - Customer: `cust_name`, `cust_phone`, `community`, `flat_no`
  - Service Details: `price_inr`, `flat_size`, `family_count`, `food_pref`, `maid_tasks[]`, `bathroom_count`
  - Status: `status`, `created_at`, `updated_at`, `assigned_at`, `accepted_at`, `on_the_way_at`, `started_at`, `completed_at`, `cancelled_at`
  - Worker Info (denormalized): `worker_name`, `worker_phone`, `worker_upi`, `worker_photo_url`
  - Cancellation: `can_cancel_until`, `cancel_reason`, `cancel_source`
  - Auto-complete: `auto_complete_at`, `auto_complete_after_minutes`
  - Payment: `pay_enabled_at`, `payout_amount`, `user_marked_paid_at`
- RLS: Users see their own bookings, workers see assigned bookings and matching pending bookings

#### `booking_assignments`
- Sequential worker assignment system
- Fields: `id`, `booking_id`, `worker_id`, `assignment_order`, `status`, `assigned_at`, `expires_at`, `response_at`
- Status: `pending`, `accepted`, `rejected`, `expired`
- Used for offering bookings to workers one-by-one with 30s timeout

#### `booking_status_history`
- Audit trail of all status changes
- Fields: `id`, `booking_id`, `from_status`, `to_status`, `changed_by`, `note`, `created_at`

#### `fcm_tokens`
- Firebase Cloud Messaging tokens for push notifications
- Fields: `user_id`, `token`, `updated_at`
- RLS: Users can only manage their own tokens

#### `worker_registration_requests`
- New worker signup requests awaiting admin approval
- Fields: `id`, `full_name`, `phone`, `upi_id`, `service_types[]`, `community`, `status`, `reviewed_by`, `reviewed_at`, `rejection_reason`
- Status: `pending`, `approved`, `rejected`

### Pricing Tables

#### `maid_pricing_tasks`
- Task-based pricing for maid service
- Fields: `id`, `flat_size`, `task` (enum: sweeping, mopping, dusting, etc.), `price_inr`, `community`, `active`

#### `cook_pricing_settings`
- Base pricing for cook service
- Fields: `community`, `base_price_inr`, `per_extra_person_inr`, `non_veg_extra_inr`

#### `bathroom_pricing_settings`
- Per-bathroom pricing
- Fields: `community`, `unit_price_inr`

### Reference Data Tables

#### `communities`
- List of available gated communities
- Fields: `id`, `name`, `value`, `is_active`

#### `services`
- Available service types
- Fields: `id`, `label`
- Current services: maid, cook, bathroom

#### `ops_settings`
- Operational configuration key-value store
- Fields: `key`, `value`, `updated_at`
- Examples: `pending_sla_minutes`, `cancel_window_instant_minutes`, `auto_complete_after_minutes.maid`

---

## 3. AUTHENTICATION SYSTEM

### Phone OTP Authentication
- Uses Supabase Auth with phone provider
- Requires SMS provider configuration (Twilio)
- No email confirmation needed for faster testing

### User Flow
1. **Sign Up**: Enter name, phone, community, flat → Verify OTP → Profile created
2. **Sign In**: Enter phone → Verify OTP → Auto-redirect to home
3. **Session Management**: 
   - Stored in Capacitor Storage for mobile
   - `useAuth` hook manages session state
   - Auto-refresh tokens enabled

### Implementation Files
- `src/hooks/useAuth.ts` - Auth state management
- `src/pages/Auth.tsx` - Sign in/sign up UI
- `src/integrations/supabase/client.ts` - Supabase client with Capacitor storage

---

## 4. WORKER FEATURES

### A. Availability Toggle (`src/components/AvailabilityToggle.tsx`)
- Switch to go Online/Offline
- Calls `update_worker_availability()` RPC function
- Updates `workers.is_available` and `last_active_at`
- Only online workers receive booking alerts

### B. Booking Alerts System

#### Web Implementation (`src/hooks/useBookingAlerts.ts`)
- Real-time subscription to `bookings` table INSERT events
- Filters for `status = 'pending'`
- Checks if worker matches `service_types` and `communities`
- Shows `BookingAlertModal` with 30s countdown timer
- Plays audio alert (`/sounds/booking_alert.mp3`)
- Actions: Accept or Reject

#### Android Implementation
**Native Overlay System** (Primary):
- `BookingOverlayService.kt` - Displays system-wide overlay on top of all apps
- `BookingNotificationService.kt` - Intercepts FCM "BOOKING_ALERT" notifications
- `BookingAlertActivity.kt` - Fullscreen activity with lock screen support
- `OverlayPlugin.java/kt` - Capacitor plugin for overlay permissions
- Shows overlay even when app is in background/killed

**Components**:
1. `BookingOverlayService.kt`:
   - Creates floating window with booking details
   - 30s countdown timer with auto-reject
   - Accept/Reject buttons
   - Calls `try_accept_booking` RPC on accept
   - Updates booking status to `cancelled` on reject

2. `BookingNotificationService.kt`:
   - Extends OneSignal notification service
   - Intercepts notifications with type "BOOKING_ALERT"
   - Starts overlay service and shows high-priority notification
   - Prevents default OneSignal notification

3. `BookingForegroundService.kt`:
   - Keeps app alive in background
   - Shows persistent notification "Ready for bookings"
   - Ensures FCM messages are received

4. `OverlayPlugin.java`:
   - Capacitor plugin methods:
     - `requestOverlayPermission()` - Request SYSTEM_ALERT_WINDOW permission
     - `checkOverlayPermission()` - Check permission status
     - `showBookingOverlay()` - Display overlay with booking data
     - `hideOverlay()` - Dismiss overlay
     - `startForegroundService()` - Start background service
     - `stopForegroundService()` - Stop background service

#### Booking Acceptance Flow
1. Worker clicks "Accept" (web modal or Android overlay)
2. Calls `try_accept_booking(booking_id)` RPC function
3. RPC validates:
   - Worker is active and available
   - Booking is still pending (row-level lock)
   - Worker matches service type and community
4. If valid:
   - Updates `bookings.status = 'assigned'`
   - Copies worker details to booking (denormalized)
   - Sets `workers.is_busy = true`
   - Returns success
5. If invalid:
   - Returns error message
   - Worker sees "Booking already taken" or other error

### C. Active Job Management (`src/components/ActiveJobCard.tsx`)

#### Job Status Workflow
1. **Assigned** → Worker accepted booking
   - Shows customer name, location, service details
   - "Start Job" button → calls `worker_set_booking_status(booking_id, 'started')`

2. **Started** → Worker pressed "Start Job"
   - Timer shows elapsed time
   - "Complete Job" button → calls `worker_set_booking_status(booking_id, 'completed')`

3. **Completed** → Job finished
   - Earnings added to worker total
   - Job cleared from active view
   - Worker becomes available again

#### Implementation (`src/hooks/useActiveJob.ts`)
- Fetches active booking: `status IN ('assigned', 'started')`
- Real-time subscription to booking updates
- Auto-refreshes on status change
- `updateJobStatus()` function calls worker RPC

### D. Booking History (`src/pages/Bookings.tsx`)
- Displays all completed bookings
- Shows earnings per job
- Search functionality by customer name, location
- Filters by status and date
- Tabs: Upcoming vs History

### E. Profile & Earnings (`src/pages/Profile.tsx`)
- Edit name, phone, community
- View total earnings
- Add/edit service types
- Manage communities served
- Sign out option

---

## 5. BACKEND ARCHITECTURE

### A. Edge Functions

#### `booking-notifications/index.ts`
**Purpose**: Notify eligible workers of new pending bookings

**Trigger**: Called automatically via database trigger `trigger_booking_assignment` when booking is created with status 'pending'

**Logic**:
1. Receives `booking_id` from trigger
2. Fetches booking details from `bookings` table
3. Queries `workers` table for matching workers:
   - `is_active = true`
   - `is_available = true`
   - Service type matches
   - Community matches
   - Active in last 24 hours
4. Orders by rating DESC, then total_ratings DESC
5. Calls `send-fcm` edge function with worker IDs and notification payload

#### `send-fcm/index.ts`
**Purpose**: Send Firebase Cloud Messaging notifications to workers

**Input**: 
```json
{
  "workerIds": ["uuid1", "uuid2"],
  "title": "New Booking",
  "body": "Maid • Prestige Lakeside • #123",
  "data": {
    "type": "BOOKING_ALERT",
    "bookingId": "uuid",
    "serviceType": "maid",
    "community": "Prestige Lakeside"
  }
}
```

**Logic**:
1. Fetches FCM tokens from `fcm_tokens` table for given worker IDs
2. Gets Firebase service account credentials from env variables
3. Generates OAuth2 access token using JWT
4. Sends FCM messages via Firebase Admin SDK
5. Logs success/failure for each notification
6. Returns summary of sent notifications

**Environment Variables Required**:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`

### B. Database Functions (RPC)

#### `try_accept_booking(p_booking_id uuid)`
**Security**: `SECURITY DEFINER` - runs with elevated privileges
**Purpose**: Atomically accept a booking with validation

**Logic**:
```sql
1. Get worker details from auth.uid()
2. Validate worker is active and available
3. Lock booking row (FOR UPDATE)
4. Check booking status is 'pending'
5. Validate worker matches service_type and community
6. Update booking:
   - status = 'assigned'
   - worker_id = worker.id
   - Copy worker_name, worker_phone, worker_upi, worker_photo_url
   - assigned_at = now()
   - confirmed_at = now()
7. Update workers.is_busy = true
8. Return success or error JSON
```

#### `worker_set_booking_status(booking_id_param uuid, new_status_param text)`
**Security**: `SECURITY DEFINER`
**Purpose**: Update booking status from worker side

**Valid Transitions**:
- `assigned` → `started`
- `assigned` or `started` → `completed`

**Logic**:
1. Verify worker_id = auth.uid()
2. Validate status transition
3. Update booking status
4. Set `completed_at` if status = 'completed'
5. Insert audit record in `booking_status_history`

#### `update_worker_availability(p_is_available boolean)`
**Purpose**: Toggle worker online/offline status

**Logic**:
1. Verify auth.uid() exists
2. Update `workers.is_available` and `last_active_at`
3. Return success/error JSON

#### `register_worker_request(...)`
**Purpose**: Submit new worker registration request

**Validation**:
- All fields required (name, phone, UPI, services, community)
- Inserts into `worker_registration_requests` with status 'pending'
- Admin must approve before worker account created

#### `admin_approve_worker_registration(p_request_id uuid, p_photo_url text)`
**Security**: Requires `is_admin()` check
**Purpose**: Admin approves worker registration

**Logic**:
1. Get request from `worker_registration_requests`
2. Create worker in `workers` table
3. Mark request as 'approved'
4. Return worker record

### C. Database Triggers

#### `on_booking_created_notify_workers`
**Table**: `bookings`
**Event**: AFTER INSERT
**Condition**: NEW.status = 'pending'

**Action**:
```sql
1. Call edge function 'booking-notifications'
2. Pass booking_id
3. Edge function handles worker notification
```

#### `log_booking_status_change`
**Table**: `bookings`
**Event**: BEFORE UPDATE
**Action**: When status changes, insert row into `booking_status_history`

#### `copy_worker_into_booking`
**Table**: `bookings`
**Event**: BEFORE UPDATE
**Action**: When `worker_id` changes, copy worker details from `workers` table to booking columns

#### `set_booking_status_timestamps`
**Table**: `bookings`
**Event**: BEFORE INSERT/UPDATE
**Action**: Auto-set `assigned_at`, `completed_at` based on status changes

#### `enforce_booking_status_transition`
**Table**: `bookings`
**Event**: BEFORE UPDATE
**Action**: Validates status transitions are legal (prevents skipping states)

#### `_recompute_can_cancel_until`
**Table**: `bookings`
**Event**: BEFORE INSERT/UPDATE
**Action**: Calculates cancellation deadline based on booking type:
- Instant: X minutes from creation (from ops_settings)
- Scheduled: Y minutes before scheduled time (from ops_settings)

### D. Row Level Security (RLS)

#### `bookings` Table
- **INSERT**: Only authenticated users, user_id must match auth.uid()
- **SELECT (Own)**: auth.uid() = user_id
- **SELECT (Admin)**: is_admin() = true
- **SELECT (Worker Assigned)**: worker_id = auth.uid()
- **SELECT (Worker Pending)**: status = 'pending' AND worker matches service/community
- **UPDATE (Own)**: auth.uid() = user_id (limited fields)
- **UPDATE (Admin)**: is_admin() = true (all fields)
- **UPDATE (Worker)**: worker_id = auth.uid() (status only)

#### `workers` Table
- **SELECT (Own)**: id = auth.uid()
- **UPDATE (Own)**: id = auth.uid()
- **ALL (Admin)**: is_admin() = true

#### `profiles` Table
- **INSERT**: auth.uid() = id
- **SELECT (Own)**: auth.uid() = id
- **SELECT (Admin)**: is_admin() = true
- **UPDATE (Own)**: auth.uid() = id

#### `fcm_tokens` Table
- **SELECT/UPDATE/INSERT**: user_id = auth.uid()

#### Admin Function
```sql
CREATE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## 6. FRONTEND ARCHITECTURE

### A. Routing (`src/App.tsx`)

**Protected Routes** (require authentication):
- `/home` - Main dashboard with availability toggle, booking alerts, active job
- `/bookings` - Booking history and upcoming jobs
- `/profile` - Worker profile and earnings
- `/settings` - App settings
- `/troubleshoot` - Debug information

**Public Routes**:
- `/auth` - Sign in/sign up with phone OTP

**Route Protection**:
```tsx
<ProtectedRoute>
  <Route path="/home" element={<Home />} />
  ...
</ProtectedRoute>
```

### B. State Management

#### Custom Hooks

1. **`useAuth()`** (`src/hooks/useAuth.ts`)
   - Manages user session and authentication state
   - Returns: `{ user, session, loading, signOut }`
   - Auto-refreshes on auth state change

2. **`useWorkerProfile(userId)`** (`src/hooks/useWorkerProfile.ts`)
   - Fetches worker data from `workers` table
   - Returns: `{ worker, loading, updateAvailability, updateWorker, refetch }`
   - Auto-refetches on userId change

3. **`useActiveJob(userId)`** (`src/hooks/useActiveJob.ts`)
   - Fetches current active booking (status = 'assigned' or 'started')
   - Real-time subscription to booking updates
   - Returns: `{ activeJob, loading, updateJobStatus, refetch }`

4. **`useBookingAlerts(userId, isOnline)`** (`src/hooks/useBookingAlerts.ts`)
   - Subscribes to new pending bookings via Realtime
   - Filters by matching service type and community
   - Shows Android overlay if enabled, else web modal
   - Returns: `{ pendingBooking, clearAlert }`

#### TanStack Query
- Used for data fetching and caching
- Configured in `src/App.tsx` with `QueryClientProvider`
- Automatic background refetching

### C. Components

#### Core Components

1. **`AvailabilityToggle`** (`src/components/AvailabilityToggle.tsx`)
   - Large toggle switch for Online/Offline
   - Shows "ONLINE" (green) or "OFFLINE" (gray)
   - Calls `updateAvailability()` from hook
   - Disabled during loading state

2. **`ActiveJobCard`** (`src/components/ActiveJobCard.tsx`)
   - Displays current job details
   - Shows customer name, location, service type, price
   - Action buttons based on status:
     - "Start Job" (assigned → started)
     - "Complete Job" (started → completed)
   - Elapsed timer for started jobs
   - Empty state when no active job

3. **`BookingAlertModal`** (`src/components/BookingAlertModal.tsx`)
   - Modal dialog with booking details
   - 30-second countdown timer with progress bar
   - Audio alert plays on show
   - Accept/Reject buttons
   - Auto-rejects on timeout
   - Closes on clearAlert()

#### UI Components (shadcn/ui)
Located in `src/components/ui/`:
- `button.tsx` - Button variants (default, outline, ghost, etc.)
- `card.tsx` - Card containers
- `badge.tsx` - Status badges
- `dialog.tsx` - Modal dialogs
- `switch.tsx` - Toggle switches
- `toast.tsx` / `sonner.tsx` - Notifications
- `progress.tsx` - Progress bars
- `separator.tsx` - Dividers
- `alert.tsx` / `alert-dialog.tsx` - Alert messages
- Plus 30+ other components

### D. Pages

#### 1. `Auth.tsx`
- Phone number input with country code (+91)
- OTP verification (6 digits)
- Sign up form: name, phone, community, flat
- Sign in flow: phone → OTP → redirect
- Form validation with error messages
- Auto-redirect if already authenticated

#### 2. `Home.tsx`
- Availability toggle (top)
- Active job card (middle)
- Booking alert modal (overlay)
- Shows empty state when no active job
- Initializes FCM and foreground service on mount

#### 3. `Bookings.tsx`
- Search bar (by customer name, location)
- Tabs: Upcoming / History
- Booking cards with:
  - Customer name and phone
  - Service type and price
  - Location (community, flat)
  - Status badge with color coding
  - Date and time
- Empty state messages
- Real-time filtering

#### 4. `Profile.tsx`
- Worker name and phone (editable)
- Community selection
- Service types (multi-select)
- Total earnings display
- Profile photo upload (future)
- Sign out button

#### 5. `Settings.tsx`
- App version
- Notification preferences
- Language selection (future)
- Theme toggle (future)
- Clear cache option

#### 6. `Troubleshoot.tsx`
- Debug information:
  - User ID
  - Worker status
  - FCM token
  - Network status
  - Supabase connection
  - App version
- Test notification button
- Logs viewer

---

## 7. MOBILE NATIVE INTEGRATION

### A. Capacitor Configuration (`capacitor.config.ts`)

```typescript
{
  appId: 'app.didisnow.worker',
  appName: 'Didi Now Worker',
  webDir: 'dist',
  server: {
    url: 'https://759fb1e2-47be-4ebf-9bb7-b8afd005a404.lovableproject.com',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
}
```

### B. Android Native Files

#### MainActivity.kt
- Extends BridgeActivity
- Registers custom plugins:
  - `OverlayPlugin` - Overlay permission and service management
- Initializes app on startup

#### Manifest Permissions (`AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

#### Services Declared
- `BookingOverlayService` - Overlay display service
- `BookingForegroundService` - Background keep-alive service
- `BookingNotificationService` - FCM notification interceptor

#### Activities
- `MainActivity` - Main Capacitor activity
- `BookingAlertActivity` - Fullscreen booking alert

#### Receivers
- `BootReceiver` - Auto-start services on device boot

### C. Firebase Configuration

#### `google-services.json`
- Firebase project configuration
- FCM server keys
- Must be placed in `android/app/`

#### `build.gradle` Dependencies
```gradle
implementation 'com.google.firebase:firebase-messaging:23.0.0'
implementation 'com.google.firebase:firebase-analytics:21.2.0'
implementation 'com.onesignal:OneSignal:4.8.3'
```

### D. Capacitor Storage (`src/lib/capacitorStorage.ts`)

Custom storage adapter for Supabase Auth:
```typescript
export const capacitorStorage = {
  getItem: async (key: string) => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  }
}
```

Used in Supabase client for persistent auth sessions.

### E. FCM Integration (`src/lib/fcm.ts`)

#### Initialization
```typescript
export async function initializeFCM() {
  if (Capacitor.getPlatform() === 'web') return;
  
  // Request permission
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive !== 'granted') {
    permStatus = await PushNotifications.requestPermissions();
  }
  
  // Register for push notifications
  await PushNotifications.register();
}
```

#### Token Management
```typescript
export async function saveFCMToken(userId: string, token: string) {
  await supabase.from('fcm_tokens').upsert({
    user_id: userId,
    token: token,
    updated_at: new Date().toISOString()
  });
}
```

#### Message Handling
```typescript
PushNotifications.addListener('pushNotificationReceived', 
  (notification) => {
    if (notification.data.type === 'BOOKING_ALERT') {
      // Show overlay via OverlayPlugin
      showBookingOverlay(notification.data);
    }
  }
);
```

---

## 8. REAL-TIME FEATURES

### A. Supabase Realtime Subscriptions

#### Booking Alerts (`useBookingAlerts.ts`)
```typescript
const channel = supabase
  .channel('booking-alerts')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'bookings',
      filter: `status=eq.pending`
    },
    (payload) => {
      // Check if worker matches
      // Show alert modal or Android overlay
    }
  )
  .subscribe();
```

#### Active Job Updates (`useActiveJob.ts`)
```typescript
const channel = supabase
  .channel(`worker-bookings-${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'bookings',
      filter: `worker_id=eq.${userId}`
    },
    (payload) => {
      // Update active job state
      // Clear if status = 'completed'
    }
  )
  .subscribe();
```

### B. Real-time Configuration

Table `bookings` must have:
```sql
ALTER TABLE bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
```

---

## 9. SECURITY FEATURES

### A. Row Level Security (RLS)
All tables have RLS enabled with strict policies (see Database section)

### B. Secure Functions
- All sensitive operations use `SECURITY DEFINER` functions
- Input validation in RPC functions
- Atomic operations with row locking (FOR UPDATE)

### C. Admin Protection
```sql
CREATE TRIGGER protect_is_admin
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_is_admin();
```
Prevents users from setting their own admin flag.

### D. API Security
- Supabase API keys (anon key only in frontend)
- Service role key only in Edge Functions
- Edge Functions verify JWT tokens
- CORS headers configured properly

---

## 10. PRICING SYSTEM

### A. Dynamic Pricing

#### Maid Service
- Task-based pricing
- Price varies by flat size (1BHK, 2BHK, 3BHK, 4BHK+)
- Community-specific pricing override
- Formula: `SUM(task_prices)` for selected tasks

**RPC Function**:
```sql
SELECT maid_total_price(
  p_flat := '2BHK',
  p_tasks := ARRAY['sweeping', 'mopping', 'dusting'],
  p_community := 'Prestige Lakeside'
)
```

#### Cook Service
- Base price + per-person charge + non-veg extra
- Community-specific settings
- Formula: `base_price + (family_count - 1) * per_person + (is_nonveg ? nonveg_extra : 0)`

#### Bathroom Cleaning
- Per-bathroom pricing
- Community-specific unit price
- Formula: `unit_price * bathroom_count`

**RPC Function**:
```sql
SELECT bath_total_price(
  p_count := 2,
  p_community := 'Prestige Lakeside'
)
```

### B. Price Calculation Flow
1. User selects service type
2. Frontend fetches pricing settings from respective table
3. Calculates total based on user inputs
4. Stores `price_inr` in booking record
5. Worker sees price on acceptance

---

## 11. CANCELLATION SYSTEM

### A. Time Windows

Configurable via `ops_settings`:
- `cancel_window_instant_minutes` - Window for instant bookings (default: 2 min)
- `cancel_window_sched_before_minutes` - Window before scheduled time (default: 15 min)

### B. Cancellation Logic

**User Cancellation** (`user_cancel_booking` RPC):
```sql
1. Check booking belongs to user
2. Check booking not already finished
3. Check now() <= can_cancel_until
4. If valid:
   - Set status = 'cancelled'
   - Set cancelled_at = now()
   - Set cancel_source = 'user'
   - Set cancel_reason = user_provided_reason
```

**Admin Cancellation** (`admin_cancel_booking` RPC):
- Admins can cancel any booking at any time
- Sets cancel_source = 'admin'

### C. Auto-Cancel on Timeout
If worker doesn't accept within 30 seconds on overlay, booking is auto-rejected by overlay service.

---

## 12. AUTO-COMPLETE SYSTEM

### A. Configuration
Per-service timeout in `ops_settings`:
- `auto_complete_after_minutes.maid` (default: 45)
- `auto_complete_after_minutes.cook` (default: 60)
- `auto_complete_after_minutes.bathroom` (default: 30)

### B. Mechanism
When booking is assigned:
```sql
UPDATE bookings SET
  auto_complete_after_minutes = <setting_value>,
  auto_complete_at = now() + interval '<minutes> minutes'
WHERE id = booking_id;
```

### C. Cron Job
Function `auto_complete_assigned()` runs periodically:
```sql
UPDATE bookings SET
  status = 'completed',
  completed_at = now()
WHERE status = 'assigned'
  AND now() >= auto_complete_at;
```

---

## 13. NOTIFICATION SYSTEM

### A. Push Notifications (FCM)

#### Flow
1. New booking created (status = 'pending')
2. Trigger calls `booking-notifications` edge function
3. Edge function finds eligible workers
4. Calls `send-fcm` edge function with worker IDs
5. FCM sends push notification to each worker's device
6. Android: `BookingNotificationService` intercepts notification
7. Shows overlay + notification

#### Notification Payload
```json
{
  "notification": {
    "title": "New Booking - Maid",
    "body": "Prestige Lakeside • #123A • ₹450"
  },
  "data": {
    "type": "BOOKING_ALERT",
    "bookingId": "uuid",
    "serviceType": "maid",
    "customerName": "John Doe",
    "community": "Prestige Lakeside",
    "flatNo": "123A",
    "priceInr": "450"
  }
}
```

### B. In-App Notifications (Toast)
Uses `sonner` library:
```typescript
import { toast } from 'sonner';

toast.success('Booking accepted!');
toast.error('Failed to accept booking');
toast.info('New booking available');
```

---

## 14. ERROR HANDLING

### A. Frontend Error Boundaries
```typescript
try {
  await updateJobStatus(bookingId, 'completed');
  toast.success('Job completed!');
} catch (error) {
  console.error('Error:', error);
  toast.error('Failed to complete job');
}
```

### B. Backend Error Responses
Edge functions return consistent error format:
```json
{
  "success": false,
  "error": "Error message"
}
```

RPC functions raise exceptions:
```sql
IF booking_not_found THEN
  RAISE EXCEPTION 'Booking not found';
END IF;
```

### C. Network Error Handling
- Retry logic in TanStack Query
- Offline detection via navigator.onLine
- Queued updates (future enhancement)

---

## 15. TESTING

### A. Test Booking Flow (`TEST_BOOKING_FLOW.sql`)
SQL script to test entire booking lifecycle:
```sql
1. Create test booking
2. Verify trigger fired
3. Check worker notifications sent
4. Simulate worker acceptance
5. Update status to 'started'
6. Update status to 'completed'
7. Verify status history
```

### B. Manual Testing Steps
1. Sign up as worker
2. Admin approves worker (via Supabase dashboard)
3. Go online
4. Create test booking (via admin or user app)
5. Verify alert received (web modal or Android overlay)
6. Accept booking
7. Start job
8. Complete job
9. Verify earnings updated

### C. Debug Tools
- Console logs in all critical functions
- `Troubleshoot` page shows:
  - Auth status
  - Worker details
  - FCM token
  - Active subscriptions
  - Network status

---

## 16. DEPLOYMENT

### A. Web Deployment (Lovable)
- Auto-deploys from GitHub
- URL: `https://759fb1e2-47be-4ebf-9bb7-b8afd005a404.lovableproject.com`
- Custom domain configurable

### B. Android APK Build
```bash
# Export to GitHub
# Clone repo locally
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### C. Edge Function Deployment
- Auto-deployed when code pushed to GitHub
- Configured in `supabase/config.toml`
- Function names must match folder names
- Secrets configured via Supabase dashboard

### D. Environment Variables

**Frontend** (via env var VITE_SUPABASE_URL):
- Supabase URL: `https://api.didisnow.com`
- Supabase Anon Key: `eyJhbGciOi...`

**Edge Functions** (via Supabase secrets):
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`

---

## 17. MAINTENANCE & MONITORING

### A. Database Maintenance
- Regular backups via Supabase
- Vacuum and analyze tables weekly
- Monitor RLS policy performance

### B. Logs
- **Edge Function Logs**: Via Supabase dashboard
- **Android Logcat**: `adb logcat | grep BookingOverlay`
- **Frontend Console**: Browser DevTools

### C. Monitoring
- Active worker count: `SELECT COUNT(*) FROM workers WHERE is_available = true`
- Pending bookings: `SELECT COUNT(*) FROM bookings WHERE status = 'pending'`
- Average acceptance time: Track via `booking_status_history`

### D. Performance
- Real-time subscriptions auto-cleanup on unmount
- Image optimization (future)
- Lazy loading routes (future)

---

## 18. KNOWN ISSUES & FUTURE ENHANCEMENTS

### Known Issues
1. FCM registration sometimes fails on first install (requires app restart)
2. Overlay permission prompt doesn't auto-open settings on some Android versions
3. Real-time subscription occasionally drops (auto-reconnects)

### Future Enhancements
1. **Multi-language support** - Hindi, Kannada, Tamil
2. **Worker ratings & reviews** - After job completion
3. **Earnings analytics** - Charts, trends, payouts
4. **In-app chat** - Between user and worker
5. **Photo upload** - Before/after job photos
6. **GPS tracking** - Worker location during job
7. **Payment integration** - Razorpay, UPI autopay
8. **Scheduled bookings management** - Calendar view
9. **Worker referral program** - Earn bonus for referrals
10. **Push notification settings** - Customize alert preferences

---

## 19. FILE STRUCTURE

```
didi-now-worker/
├── android/                          # Android native code
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/app/didisnow/worker/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── BookingOverlayService.kt
│   │   │   │   ├── BookingForegroundService.kt
│   │   │   │   ├── BookingNotificationService.kt
│   │   │   │   ├── BookingAlertActivity.kt
│   │   │   │   ├── OverlayPlugin.java
│   │   │   │   ├── OverlayPlugin.kt
│   │   │   │   ├── OverlayPermissionHelper.kt
│   │   │   │   ├── BatteryOptimizationHelper.kt
│   │   │   │   └── BootReceiver.kt
│   │   │   ├── res/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── overlay_booking_alert.xml
│   │   │   │   │   └── activity_booking_alert.xml
│   │   │   │   └── drawable/
│   │   │   │       └── ic_notification.xml
│   │   │   └── AndroidManifest.xml
│   │   ├── build.gradle
│   │   └── google-services.json
│   ├── build.gradle
│   └── variables.gradle
├── public/
│   ├── sounds/
│   │   └── booking_alert.mp3
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components (40+ files)
│   │   ├── ActiveJobCard.tsx
│   │   ├── AvailabilityToggle.tsx
│   │   └── BookingAlertModal.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useWorkerProfile.ts
│   │   ├── useActiveJob.ts
│   │   ├── useBookingAlerts.ts
│   │   ├── use-toast.ts
│   │   └── use-mobile.tsx
│   ├── integrations/supabase/
│   │   ├── client.ts
│   │   └── types.ts                  # Auto-generated
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── fcm.ts
│   │   ├── capacitorStorage.ts
│   │   ├── foregroundService.ts
│   │   ├── overlay.ts
│   │   ├── androidOverlay.ts
│   │   └── alertOverlay.ts
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── Home.tsx
│   │   ├── Bookings.tsx
│   │   ├── Profile.tsx
│   │   ├── Settings.tsx
│   │   ├── Troubleshoot.tsx
│   │   └── NotFound.tsx
│   ├── push/
│   │   └── webPush.ts
│   ├── App.tsx
│   ├── App.css
│   ├── main.tsx
│   ├── index.css
│   └── vite-env.d.ts
├── supabase/
│   ├── functions/
│   │   ├── booking-notifications/
│   │   │   └── index.ts
│   │   └── send-fcm/
│   │       └── index.ts
│   ├── migrations/                   # All SQL migrations
│   └── config.toml
├── capacitor.config.ts
├── tailwind.config.ts
├── vite.config.ts
├── package.json
├── README.md
├── WORKER_NOTIFICATION_FLOW.md
└── TEST_BOOKING_FLOW.sql
```

---

## 20. API REFERENCE

### Supabase RPC Functions

```typescript
// Accept booking
const { data, error } = await supabase.rpc('try_accept_booking', {
  p_booking_id: 'uuid'
});

// Update booking status (worker)
const { data, error } = await supabase.rpc('worker_set_booking_status', {
  booking_id_param: 'uuid',
  new_status_param: 'started' | 'completed'
});

// Update worker availability
const { data, error } = await supabase.rpc('update_worker_availability', {
  p_is_available: true | false
});

// Register new worker (request)
const { data, error } = await supabase.rpc('register_worker_request', {
  p_full_name: 'John Doe',
  p_phone: '+919876543210',
  p_upi_id: 'john@upi',
  p_service_types: ['maid', 'bathroom'],
  p_community: 'Prestige Lakeside'
});

// Admin: Approve worker registration
const { data, error } = await supabase.rpc('admin_approve_worker_registration', {
  p_request_id: 'uuid',
  p_photo_url: 'https://...'
});

// Admin: Assign worker to booking
const { data, error } = await supabase.rpc('assign_worker_to_booking', {
  p_booking_id: 'uuid',
  p_worker_id: 'uuid',
  p_assigned_by: 'uuid'
});

// User: Cancel booking
const { data, error } = await supabase.rpc('user_cancel_booking', {
  p_booking_id: 'uuid',
  p_reason: 'Changed plans'
});

// Calculate maid pricing
const { data, error } = await supabase.rpc('maid_total_price', {
  p_flat: '2BHK',
  p_tasks: ['sweeping', 'mopping'],
  p_community: 'Prestige Lakeside'
});

// Calculate bathroom pricing
const { data, error } = await supabase.rpc('bath_total_price', {
  p_count: 2,
  p_community: 'Prestige Lakeside'
});
```

### Capacitor Plugins

```typescript
import { Plugins } from '@capacitor/core';
const { Overlay } = Plugins;

// Request overlay permission
await Overlay.requestOverlayPermission();

// Check overlay permission
const { granted } = await Overlay.checkOverlayPermission();

// Show booking overlay
await Overlay.showBookingOverlay({
  booking: {
    id: 'uuid',
    service_type: 'maid',
    cust_name: 'John Doe',
    community: 'Prestige Lakeside',
    flat_no: '123A',
    price_inr: 450
  }
});

// Hide overlay
await Overlay.hideOverlay();

// Start foreground service
await Overlay.startForegroundService();

// Stop foreground service
await Overlay.stopForegroundService();
```

---

## 21. TROUBLESHOOTING

### Issue: Worker not receiving booking alerts

**Web**:
1. Check browser console for errors
2. Verify real-time subscription status
3. Check worker profile: `is_active = true`, `is_available = true`
4. Verify service_types and communities match booking

**Android**:
1. Check overlay permission: Settings → Apps → Didi Now Worker → Display over other apps
2. Check notification permission: Settings → Apps → Didi Now Worker → Notifications
3. Verify FCM token in `fcm_tokens` table
4. Check Logcat: `adb logcat | grep BookingOverlay`
5. Ensure foreground service is running

### Issue: Booking acceptance fails

1. Check booking status is still 'pending'
2. Verify worker matches service type and community
3. Check worker `is_active` and `is_available` flags
4. Look for RLS policy errors in Supabase logs
5. Verify `try_accept_booking` RPC function exists

### Issue: Real-time subscription not working

1. Check Supabase project has Realtime enabled
2. Verify table has `REPLICA IDENTITY FULL`
3. Check table is added to `supabase_realtime` publication
4. Inspect browser console for subscription errors
5. Verify JWT token is valid

### Issue: FCM notifications not delivered

1. Verify `google-services.json` is present in `android/app/`
2. Check Firebase project configuration
3. Verify FCM token is saved in `fcm_tokens` table
4. Check Edge Function logs for `send-fcm` errors
5. Test FCM token with Firebase Console

### Issue: Overlay not showing on Android

1. Grant SYSTEM_ALERT_WINDOW permission
2. Disable battery optimization for app
3. Check `BookingOverlayService` is running
4. Verify overlay layout file exists
5. Check Logcat for crashes

---

## 22. CONTACT & SUPPORT

For development questions:
- Review `WORKER_NOTIFICATION_FLOW.md` for booking flow
- Check `TEST_BOOKING_FLOW.sql` for testing
- Inspect Supabase Dashboard → Logs for errors
- Use `Troubleshoot` page in app for debug info

---

**END OF DOCUMENTATION**

This document covers all aspects of the Didi Now Worker App. Developers should:
1. Read this document thoroughly
2. Set up local development environment
3. Test booking flow end-to-end
4. Review security policies before modifications
5. Follow existing patterns for new features
