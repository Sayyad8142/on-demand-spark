# Demo Login Guide for Play Store Reviewers

## Overview
This app includes a special demo login mode for Play Store reviewers that works **without sending real SMS messages**. It uses Firebase Authentication's test phone number feature.

## Setup (Required - Must be done in Firebase Console)

### ⚠️ CRITICAL: Firebase Test Phone Number Configuration

**This MUST be configured for demo login to work:**

1. **Go to Firebase Console:**
   - Open: https://console.firebase.google.com/
   - Select your project
   
2. **Configure Test Phone Number:**
   - Navigate to: **Authentication → Sign-in method**
   - Scroll down to **"Phone"** provider
   - Click **"Phone numbers for testing"**
   - Click **"Add phone number"**
   - Enter:
     - Phone number: `+91 9999999999`
     - Test code: `123456`
   - Click **Save**

**Why this is required:** Firebase test phone numbers allow authentication without sending real SMS messages. The OTP `123456` will always work for `+91 9999999999` without any network requests.

2. **Database Setup:**
   - A demo worker profile is automatically created on first login
   - Phone: `+91 9999999999`
   - Name: `Demo Partner`
   - Service: `Maid`
   - Community: `Prestige High Fields`

## How Reviewers Use Demo Login

### Option 1: Using Demo Login Link

1. Open the app
2. On the login screen, tap **"Use demo login"** link below the Sign In button
3. The phone field will auto-fill with `9999999999`
4. Tap "Send OTP"
5. Helper text will appear: "Demo for reviewers: Use OTP 123456"
6. Enter OTP: `123456`
7. Tap "Verify OTP"
8. ✅ Logged in successfully!

### Option 2: Manual Entry

1. Open the app
2. Enter phone: `9999999999`
3. Tap "Send OTP"
4. Helper text appears: "Demo for reviewers: Use OTP 123456"
5. Enter OTP: `123456`
6. Tap "Verify OTP"
7. ✅ Logged in successfully!

## What Happens After Demo Login

- A **yellow banner** appears at the top: "🎭 Demo Mode (For Review Only)"
- The banner is dismissible (tap X to hide)
- The demo user can:
  - ✅ Toggle availability online/offline
  - ✅ Receive test booking notifications
  - ✅ Accept/reject bookings
  - ✅ Manage active jobs
  - ✅ View booking history
  - ✅ Edit profile settings

## Important Notes

- ⚠️ **No SMS is sent** - Firebase recognizes the test number and accepts OTP `123456` without network requests
- ⚠️ **Single demo profile** - Reuses one pre-created worker record, doesn't create new accounts
- ⚠️ **Play Store compliant** - No real phone numbers or SMS sending involved
- ⚠️ **Full functionality** - Reviewers can test all app features normally

## For Play Console Submission

Include this text in the "Notes for Reviewers" section:

```
Demo Login Credentials:
- Phone: 9999999999
- OTP: 123456

Or tap "Use demo login" link on the login screen to auto-fill.

This is a test account that does not send real SMS messages.
You can toggle availability online to receive test booking notifications.
```

## Technical Details

- Demo phone: `+91 9999999999`
- Demo OTP: `123456` (Firebase test code)
- Demo detection: Checks `user.phone === '+919999999999'`
- Flag storage: `localStorage.setItem('is_demo_user', 'true')`
- Banner: Shows on Home when `is_demo_user` flag is set
- Worker profile: Upserted on first demo login to ensure existence

## Troubleshooting

**Q: OTP verification fails**
- A: Ensure Firebase test number is configured correctly in Firebase Console

**Q: Demo banner doesn't show**
- A: Check browser localStorage for `is_demo_user` flag, or refresh the page

**Q: Can't receive bookings**
- A: Toggle availability online, ensure demo worker has correct service_types and communities

**Q: Multiple demo accounts created**
- A: Fixed - uses `upsert` with `onConflict: 'id'` to reuse single demo worker record
