# 🎭 Demo Login Guide for Play Store Reviewers

This guide explains how to set up and use the demo login feature for Google Play Console reviewers.

## Overview

The demo login allows Play Store reviewers to test the app without requiring a real phone number or SMS verification. It uses Firebase Auth's "Test Phone Numbers" feature to provide a seamless review experience.

## Setup Steps

### 1. Firebase Console Setup (One-Time)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication** → **Sign-in method**
4. Click on **Phone** provider
5. Scroll down to **Phone numbers for testing**
6. Click **Add phone number**
7. Enter:
   - **Phone number:** `+91 9999999999`
   - **Verification code:** `123456`
8. Click **Add**

**Important:** No actual SMS will be sent to this number. The OTP `123456` will always work.

### 2. Supabase Setup (Optional)

The demo worker profile is automatically created on first login. However, you can pre-create it:

```sql
-- Check if demo worker exists
SELECT * FROM workers WHERE phone = '+919999999999';

-- If you need to manually create/update the demo worker:
INSERT INTO workers (
  id, 
  full_name, 
  phone, 
  service_types, 
  communities, 
  is_active, 
  is_available, 
  is_busy
) VALUES (
  'your-demo-user-auth-id',  -- Get this from Firebase Auth after first login
  'Demo Partner',
  '+919999999999',
  ARRAY['maid'],
  ARRAY['Prestige High Fields'],
  true,
  false,
  false
)
ON CONFLICT (phone) 
DO UPDATE SET 
  full_name = EXCLUDED.full_name,
  service_types = EXCLUDED.service_types,
  communities = EXCLUDED.communities;
```

## How Reviewers Use Demo Login

### Method 1: Auto-Fill Link (Recommended)

1. Open the app
2. On the login screen, click **"Use demo login (for reviewers)"** link
3. The phone number will auto-fill: `9999999999`
4. A helper message appears: *"Demo for reviewers: Use OTP 123456"*
5. Click **"Send OTP"**
6. Enter OTP: `123456`
7. Click **"Verify OTP"**
8. You're logged in! A yellow banner shows: **🎭 Demo Mode (For Review Only)**

### Method 2: Manual Entry

1. Open the app
2. On the login screen, enter phone: `9999999999`
3. A yellow helper box appears with: *"Demo for reviewers: Use OTP 123456"*
4. Click **"Send OTP"**
5. Enter OTP: `123456`
6. Click **"Verify OTP"**
7. Logged in with demo banner

## Demo Mode Features

When logged in as demo user:

✅ **Yellow banner** at top of home screen indicating demo mode
✅ Banner is **dismissible** (can be closed for the session)
✅ Full access to all app features
✅ Pre-configured with:
- **Name:** Demo Partner
- **Service:** Maid
- **Community:** Prestige High Fields
✅ No real SMS charges
✅ No data pollution (reuses same worker profile)

## For Play Console Submission

When submitting to Google Play Console:

1. Go to **App Content** → **App Access**
2. Select **"All or some functionality is restricted"**
3. Add test account:
   - **Username/Phone:** `+91 9999999999`
   - **Password/OTP:** `123456`
4. Add instructions:

```
Demo Login Instructions:
1. On the login screen, click "Use demo login (for reviewers)"
   OR manually enter phone: 9999999999
2. Click "Send OTP"
3. Enter OTP: 123456
4. Click "Verify OTP"

A yellow "Demo Mode" banner will appear confirming you're in demo mode.
You now have full access to test all features as a partner/worker.
```

## Technical Details

### How It Works

1. **Firebase Test Numbers:** No SMS is sent; OTP `123456` always succeeds
2. **Detection:** App checks if phone === `+919999999999`
3. **Storage:** Sets `is_demo_user=true` in localStorage
4. **Worker Profile:** Upserts demo worker on login (prevents duplicates)
5. **Banner:** React component checks localStorage + worker phone

### Code Files

- `src/config/demo.ts` - Demo constants and utilities
- `src/pages/Auth.tsx` - Login screen with demo support
- `src/pages/Home.tsx` - Demo banner component

### Security

✅ No hardcoded credentials in production
✅ Uses Firebase's official test number feature
✅ No service-role key exposure
✅ Single demo account (no spam)
✅ Analytics logged without PII

## Troubleshooting

**Q: Demo login not working?**
- Verify Firebase test number is set up correctly
- Check phone format: `+91 9999999999`
- Ensure OTP is exactly: `123456`

**Q: Banner not showing?**
- Check localStorage for `is_demo_user=true`
- Verify worker.phone === `+919999999999`
- Try dismissing and reopening app

**Q: Multiple demo workers created?**
- Should not happen due to upsert by phone
- Check database: `SELECT * FROM workers WHERE phone = '+919999999999';`
- Should only be 1 row

## Support

For questions about demo mode:
- Email: team@didisnow.com
- Phone: +91 80081 80018
