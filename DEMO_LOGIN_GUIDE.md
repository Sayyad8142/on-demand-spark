# 🎭 Demo Login Guide for Play Store Reviewers

This guide explains how to use the demo login feature for Google Play Console reviewers.

## Overview

The demo login allows Play Store reviewers to test the app without requiring a real phone number or SMS verification. It **bypasses SMS entirely** by using password-based authentication behind the scenes.

## Demo Credentials

**Phone Number:** `+91 9999999999` (or just `9999999999`)  
**OTP Code:** `123456` (auto-filled)

## How Reviewers Use Demo Login

### Method 1: Auto-Fill Link (Recommended)

1. Open the app
2. On the login screen, tap **"Use demo login (for reviewers)"** link
3. The phone number will auto-fill: `9999999999`
4. OTP `123456` will be auto-filled immediately
5. Tap **"Verify OTP"**
6. You're logged in! A yellow banner shows: **🎭 Demo Mode (For Review Only)**

### Method 2: Manual Entry

1. Open the app
2. On the login screen, enter phone: `9999999999`
3. A yellow helper box appears with: *"Demo for reviewers: Use OTP 123456"*
4. Tap **"Send OTP"** - OTP will auto-fill
5. Tap **"Verify OTP"**
6. Logged in with demo banner

## Demo Mode Features

When logged in as demo user:

✅ **Yellow banner** at top of home screen indicating demo mode  
✅ Banner is **dismissible** (can be closed for the session)  
✅ Full access to all app features  
✅ Pre-configured with:
- **Name:** Demo Partner
- **Service:** Maid
- **Community:** Prestige High Fields
- **Status:** Available (can receive bookings immediately)

✅ **No SMS sent** - completely offline demo flow  
✅ **No Firebase setup required** - works out of the box  
✅ No data pollution (reuses same worker profile)  

## For Play Console Submission

When submitting to Google Play Console:

1. Go to **App Content** → **App Access**
2. Select **"All or some functionality is restricted"**
3. Add test account:
   - **Username/Phone:** `+91 9999999999` or `9999999999`
   - **Password/OTP:** `123456` (auto-filled)
4. Add instructions:

```
Demo Login Instructions:
1. On the login screen, tap "Use demo login (for reviewers)"
   OR manually enter phone: 9999999999
2. Tap "Send OTP" (OTP will auto-fill to 123456)
3. Tap "Verify OTP"

A yellow "Demo Mode" banner will appear confirming you're in demo mode.
You now have full access to test all features as a partner/worker.
```

## Technical Details

### How It Works

1. **OTP Auto-Fill:** When demo phone is detected, OTP `123456` is auto-filled
2. **Password Auth:** Behind the scenes, uses `demo@didisnow.app` email/password auth
3. **No SMS:** Completely bypasses Firebase phone auth and SMS
4. **Detection:** App checks if phone === `+919999999999`
5. **Storage:** Sets `is_demo_user=true` in localStorage
6. **Worker Profile:** Upserts demo worker on login (prevents duplicates)
7. **Banner:** React component checks localStorage + worker phone

### Code Files

- `src/config/demo.ts` - Demo constants and utilities
- `src/pages/Auth.tsx` - Login screen with demo support
- `src/pages/Home.tsx` - Demo banner component

### Security

✅ No SMS sent (completely bypassed)  
✅ Password-based auth behind the scenes  
✅ No service-role key exposure  
✅ Single demo account (no spam)  
✅ Analytics logged without PII  
✅ Works in dev and production  

### Supabase Database

A single demo worker record is automatically created/updated:

```sql
{
  id: <demo_user_auth_id>,
  full_name: 'Demo Partner',
  phone: '+919999999999',
  service_types: ['maid'],
  communities: ['Prestige High Fields'],
  is_active: true,
  is_available: true,  // Available to receive bookings
  is_busy: false,
  availability_slots: [true, true, ...] // All 26 slots enabled
}
```

The record is **upserted** (not duplicated) on each demo login using phone as unique key.

## Troubleshooting

**Q: Demo login not working?**
- Ensure phone is exactly `9999999999` (10 digits)
- OTP should auto-fill to `123456`
- Try clearing app data and logging in again

**Q: Banner not showing?**
- Check localStorage for `is_demo_user=true`
- Verify worker.phone === `+919999999999`
- Try dismissing and reopening app

**Q: "Invalid credentials" error?**
- First-time demo login may take 2-3 seconds to create account
- Wait and try again
- Should work on second attempt

## Support

For questions about demo mode:
- Email: team@didisnow.com
- Phone: +91 80081 80018

---

**Last Updated:** 2025-01-11  
**Implementation:** Password-based auth (no Firebase setup needed)  
**Demo Phone:** +91 9999999999  
**Demo OTP:** 123456 (auto-filled)
