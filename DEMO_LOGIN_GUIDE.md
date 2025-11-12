# Demo Login Guide for Play Store Reviewers

This app includes a special demo login feature designed for Play Store reviewers to test the app without needing a real phone number or receiving actual SMS messages.

## Demo Credentials

**Phone Number:** `+91 9999999999`  
**OTP Code:** `123456`

## How It Works

### For App Users (Reviewers)

1. Open the app and navigate to the login screen
2. Click on **"Use demo login (for Play Store reviewers)"** link at the bottom of the Sign In tab
3. The phone number field will be auto-filled with `9999999999`
4. Click **"Send OTP"**
5. Enter the OTP: `123456` (this is a fixed test code, no SMS will be sent)
6. Click **"Verify OTP"** to sign in
7. A dismissible banner will appear on the Home screen indicating "Demo Mode (For Review Only)"

### For Developers

The demo login uses Firebase Authentication's **test phone numbers** feature, which allows specific phone numbers to bypass SMS verification in production. This is the recommended approach by Google for app store reviews.

**Important:** You must configure this test phone number in Firebase Console before the demo login will work.

## Firebase Console Configuration (REQUIRED)

⚠️ **CRITICAL STEP** - The demo login will NOT work until you complete this setup:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication** → **Sign-in method**
4. Scroll down to **Phone numbers for testing** section
5. Click **Add phone number**
6. Add the following:
   - **Phone number:** `+91 9999999999`
   - **Verification code:** `123456`
7. Click **Add**

### Why This Configuration Is Required

Firebase Authentication normally sends real SMS messages to verify phone numbers. Test phone numbers bypass this:
- ✅ No actual SMS sent (no SMS costs, no network requests)
- ✅ Fixed OTP code works every time
- ✅ Production-safe (only works with specifically configured numbers)
- ✅ Google Play Store compliant

Without this configuration, the OTP verification will fail with an error like "Token has expired or is invalid" or "OTP expired".

## Technical Details

### Files Modified

- **`src/config/demo.ts`** - Demo configuration constants
- **`src/pages/Auth.tsx`** - Login page with demo mode integration
- **`src/pages/Home.tsx`** - Home page with demo banner

### How Demo Detection Works

1. When a user signs in with `+91 9999999999`, the app detects it's a demo user
2. A flag is stored in localStorage: `is_demo_user = true`
3. A demo worker profile is automatically created/updated in the database
4. The Home page checks this flag and displays a dismissible banner

### Demo Worker Profile

The demo account automatically creates a worker with these details:
- **Name:** Demo Partner
- **Phone:** +91 9999999999
- **Service Type:** Maid
- **Community:** Prestige High Fields
- **Status:** Active (but not available by default)

## Security Considerations

- Demo mode only works with the specific test phone number configured in Firebase
- The demo flag is stored in localStorage and can be cleared by the user
- The banner is dismissible and uses sessionStorage so it won't reappear during the session
- Real production users will never see demo mode functionality

## Testing the Demo Login

1. Ensure Firebase test phone is configured (see above)
2. Open the app
3. Click "Use demo login" link
4. Send OTP and verify with `123456`
5. Verify you see the amber "Demo Mode" banner on Home
6. Test app functionality as a normal user would

## Troubleshooting

### "Token has expired or is invalid" Error

This means the test phone number is not configured in Firebase Console. Follow the configuration steps above.

### Demo Banner Not Showing

Check browser console for the log: `🎭 Demo user login detected`. If missing, the demo detection logic isn't triggering.

### Demo Worker Not Created

Check the browser console for database errors during login. The worker should be automatically upserted on successful demo login.

## Compliance

This implementation follows Google Play Store guidelines for providing test accounts to reviewers:
- Uses Firebase's built-in test phone functionality
- Clearly labeled as "Demo" in the UI
- No actual SMS sent (no network requests to carriers)
- Provides full app functionality for review
