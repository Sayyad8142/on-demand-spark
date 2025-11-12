# Didi Now Worker App

Production-ready worker app for instant on-demand services (maids, cooks, bathroom cleaning) in gated communities.

## Features

✅ **Phone OTP Authentication** - Secure sign in/sign up with SMS OTP  
✅ **Online/Offline Toggle** - Control availability to accept bookings  
✅ **Live Booking Alerts** - Real-time notifications with 30s accept/reject timer  
✅ **Active Job Management** - Track job status: On the Way → Start Work → Complete  
✅ **Booking History** - View upcoming and completed bookings with search  
✅ **Profile & Earnings** - Edit services, communities, view total earnings  
✅ **Real-time Updates** - Live Supabase subscriptions for instant updates  

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui (hot pink #ff007a theme)
- **Backend**: Supabase (auth, database, real-time)
- **Routing**: React Router v6 with protected routes

## Database Schema

**Tables:**
- `profiles` - User profiles
- `workers` - Worker details (services, communities, availability, earnings)
- `bookings` - Job bookings with status workflow

**RPC Functions:**
- `accept_booking(p_booking_id)` - Accept a pending booking
- `update_booking_status(p_booking_id, p_status)` - Update job status

## Setup

1. **Enable Phone Auth in Supabase:**
   - Go to Authentication > Providers
   - Enable Phone provider
   - Configure Twilio or another SMS provider
   - **Important:** Disable "Confirm email" in Settings to speed up testing

2. **Test the App:**
   - Sign up as a new worker
   - Admin will need to approve (set `is_active = true` in workers table)
   - Go online to start receiving booking alerts
   - Test the full workflow: Accept → On the Way → Start Work → Complete

## Reviewer Demo Login

For **Play Store reviewers**, a special demo login is available that works without real SMS:

**Credentials:**
- Phone: `9999999999`
- OTP: `123456`

**Instructions:**
1. Open the app and tap **"Use demo login"** link below Sign In button
2. Phone field auto-fills with `9999999999`
3. Tap "Send OTP"
4. Enter OTP: `123456`
5. Tap "Verify OTP"
6. A yellow "Demo Mode" banner appears - you're in!

This uses Firebase test phone numbers (no SMS sent). See [DEMO_LOGIN_GUIDE.md](./DEMO_LOGIN_GUIDE.md) for full details.

## User Flow

1. **Sign Up** → Enter name, phone, community, service → Verify OTP → Wait for approval
2. **Sign In** → Enter phone → Verify OTP → Access home screen
3. **Go Online** → Toggle availability on → Receive booking alerts
4. **Accept Job** → 30s timer → Accept → Job becomes active
5. **Complete Job** → On the Way → Start Work → Complete → Earn money
6. **View History** → See all completed jobs and earnings

## Routes

- `/auth` - Sign in/sign up with OTP
- `/home` - Availability toggle, booking alerts, active job
- `/bookings` - Upcoming and history with search
- `/profile` - Edit profile, view earnings

## Design Highlights

- Hot pink (#ff007a) primary color for brand energy
- Soft shadows and rounded corners (rounded-2xl)
- Mobile-first responsive design
- Large tap targets for easy mobile use
- Smooth transitions and loading states

## Next Steps

- Add FCM push notifications for background alerts
- Implement worker ratings and reviews
- Add earnings analytics and payout tracking
- Multi-language support

---

Built with ❤️ using Lovable + Supabase
