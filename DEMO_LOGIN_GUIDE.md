# Demo Login Guide for Play Store Reviewers

This app includes a special demo login feature designed for Play Store reviewers to test the app without needing a real phone number or receiving actual SMS messages.

## Demo Credentials

**Phone Number:** `+91 9999999999`  
**OTP Code:** `123456`

## Supabase Configuration (REQUIRED - One-Time Setup)

⚠️ **CRITICAL STEP** - The demo login requires disabling phone confirmation in Supabase:

### Steps to Enable Demo Login:

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard/project/paywwbuqycovjopryele
2. Navigate to **Authentication** → **Providers**
3. Find **Phone** provider
4. **Disable** the toggle for **"Enable phone confirmations"**
5. Click **Save**

### Why This Is Required

Supabase Phone Authentication normally requires real SMS verification. By disabling phone confirmations:
- ✅ Any OTP code will be accepted (including our demo OTP `123456`)
- ✅ No actual SMS sent (free, no network requests)
- ✅ Demo login works immediately
- ✅ Play Store reviewers can test full functionality

**Important**: This setting affects ALL phone logins, so you may want to re-enable it after Play Store approval. For production, consider implementing a dedicated demo endpoint or using email-based demo accounts.

## How It Works

### For App Users (Reviewers)

1. Open the app and navigate to the login screen
2. Click on **"Use demo login (for Play Store reviewers)"** link at the bottom of the Sign In tab
3. The phone number field will be auto-filled with `9999999999`
4. Click **"Send OTP"** (no SMS will be sent)
5. A helper message will show: "Use OTP: 123456 (no SMS sent)"
6. Enter the OTP: `123456`
7. Click **"Verify OTP"** to sign in
8. A dismissible banner will appear on the Home screen indicating "Demo Mode (For Review Only)"

### For Developers

The demo login flow:
1. Detects the demo phone number (`+91 9999999999`)
2. Skips the SMS sending step
3. Shows a helper message with the OTP
4. Accepts the hardcoded OTP (`123456`) when phone confirmation is disabled
5. Creates/updates a demo worker profile automatically
6. Shows a demo mode banner on the home screen

## Technical Details

### Files Modified

- **`src/config/demo.ts`** - Demo configuration constants
- **`src/pages/Auth.tsx`** - Login page with demo mode integration  
- **`src/pages/Home.tsx`** - Home page with demo banner

### Demo Worker Profile

The demo account automatically creates a worker with these details:
- **Name:** Demo Partner
- **Phone:** +91 9999999999
- **Service Type:** Maid
- **Community:** Prestige High Fields
- **Status:** Active (but not available by default)

### How Demo Detection Works

1. When a user enters `+91 9999999999`, the app detects it's a demo user
2. SMS sending is skipped and a helper message is shown
3. After successful OTP verification, a flag is stored: `is_demo_user = true`
4. A demo worker profile is automatically created/updated in the database
5. The Home page displays a dismissible demo mode banner

## Security Considerations

- Demo mode only works with the specific phone number `+91 9999999999`
- The demo flag is stored in localStorage and can be cleared
- The banner uses sessionStorage so it won't reappear during the same session
- With phone confirmation disabled, **any** phone number can use **any** OTP (security trade-off for review purposes)

## Testing the Demo Login

1. Ensure phone confirmation is disabled in Supabase (see configuration steps above)
2. Open the app
3. Click "Use demo login" link
4. Click "Send OTP" (no SMS sent)
5. Enter OTP `123456`
6. Verify successful login and demo banner appears

## Troubleshooting

### "Token has expired or is invalid" Error

This means phone confirmation is still enabled in Supabase. Follow these steps:
1. Go to Supabase Dashboard → Authentication → Providers
2. Find Phone provider
3. **Disable** "Enable phone confirmations"
4. Save changes
5. Try demo login again

### Demo Banner Not Showing

Check browser console for the log: `🎭 Demo user login detected`. If missing, check that:
- You're using the exact phone number: `9999999999`
- The OTP is exactly: `123456`

### Demo Worker Not Created

Check the browser console for database errors during login. The worker should be automatically upserted on successful demo login.

## Alternative: Re-enabling Phone Confirmation After Review

Once your app is approved, you can re-enable phone confirmation:
1. Go to Supabase Dashboard → Authentication → Providers
2. Find Phone provider
3. **Enable** "Enable phone confirmations"
4. Save changes

The demo login will stop working (will show error), but production users will have proper SMS verification.

## Production Recommendations

For production apps, consider these alternatives to globally disabling phone confirmation:

1. **Dedicated Demo Endpoint**: Create an edge function that generates demo sessions
2. **Email-based Demo**: Use email/password auth for demo accounts instead of phone
3. **Pre-created Demo Account**: Create a real account with a real phone number for reviewers
4. **Conditional Bypass**: Check phone number server-side and bypass OTP only for specific numbers

## Compliance

This implementation follows Google Play Store guidelines for providing test accounts:
- Clearly labeled as "Demo" in the UI
- No actual SMS sent when using demo credentials
- Provides full app functionality for review
- Easy to disable after approval
