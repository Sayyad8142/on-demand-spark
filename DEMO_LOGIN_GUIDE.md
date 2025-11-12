# Demo Login Guide for Play Store Reviewers

This guide explains how to set up and use the demo login feature for Play Store review purposes.

## Demo Credentials

- **Phone Number**: `+91 9999999999` (or just enter `9999999999`)
- **OTP**: `123456`

## CRITICAL Setup Requirement

**You MUST disable phone confirmations in Supabase Dashboard for the demo login to work:**

1. Go to [Supabase Auth Providers](https://supabase.com/dashboard/project/paywwbuqycovjopryele/auth/providers)
2. Click on **Phone** provider
3. **Disable** the "Enable phone confirmations" toggle
4. Save the changes

Without this step, the demo OTP will not work and you'll get "Token has expired or is invalid" errors.

## How to Use Demo Login

### For Play Store Reviewers:

1. Open the app
2. On the login screen, click **"Use demo login (for reviewers)"**
3. The phone number field will auto-fill with `9999999999`
4. Click **"Send OTP"**
5. The OTP field will show a helper text with the demo OTP: `123456`
6. Enter `123456` as the OTP
7. Click **"Verify OTP"**
8. You'll be logged in as "Demo Partner"

### Demo Mode Indicators:

- A dismissible **"Demo Mode (For Review Only)"** banner appears on the Home page
- Helper text shows the demo OTP during login

## Demo Worker Profile

The demo account has the following profile:

- **Name**: Demo Partner
- **Phone**: +91 9999999999
- **Service Type**: Maid
- **Community**: Prestige High Fields
- **Status**: Active but not available (can be toggled)

## Technical Details

- Demo credentials are stored in `src/config/demo.ts`
- Demo mode is detected via phone number and stored in localStorage
- The demo worker is automatically created/updated in the database via migration

## Troubleshooting

If you encounter "Token has expired or is invalid" errors:

1. Verify phone confirmations are **DISABLED** in Supabase Dashboard
2. Clear browser cache and try again
3. Ensure you're using the exact OTP: `123456`

## Security Notes

- This demo login bypasses real SMS verification
- Phone confirmations must be disabled for demo to work
- Demo mode is clearly labeled for reviewers
- In production, re-enable phone confirmations after Play Store approval
