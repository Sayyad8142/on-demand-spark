# Play Store Submission - Ready Checklist

## Version Information
- **App Name**: Didi Now Partner
- **App ID**: app.didisnow.worker
- **Version**: 1.0.6 (versionCode 7)
- **Target SDK**: 35 (Android 15)
- **Min SDK**: 24 (Android 7.0)

## ✅ Compliance Completed

### Permissions (All Justified)
- **INTERNET**: Required for API communication with booking backend
- **POST_NOTIFICATIONS**: Required for booking alert notifications
- **RECEIVE_BOOT_COMPLETED**: Only logs device boot (does NOT auto-start services)

### Removed High-Risk Permissions
- ❌ SYSTEM_ALERT_WINDOW - Removed
- ❌ REQUEST_IGNORE_BATTERY_OPTIMIZATIONS - Removed (manual settings access only)
- ❌ USE_FULL_SCREEN_INTENT - Removed
- ❌ ACCESS_FINE_LOCATION - Removed
- ❌ ACCESS_COARSE_LOCATION - Removed
- ❌ ACCESS_BACKGROUND_LOCATION - Removed
- ❌ FOREGROUND_SERVICE - Removed
- ❌ VIBRATE - Removed

### Permission Helpers Updated
- `BatteryOptimizationHelper`: Opens settings manually (no automatic requests)
- `OverlayPermissionHelper`: Opens settings manually (no automatic popup dialogs)
- `BootReceiver`: Only logs boot events (no service auto-start)

### Notification Safety
- Channel name: "Booking Alerts" (neutral)
- Channel description: "Booking notifications" (neutral, removed "urgent")
- Permission notification: "Overlay Permission Required" (removed emoji)
- Notification importance: HIGH (not MAX)
- No full-screen intents
- No ongoing/foreground flags unless required
- Proper heads-up display with safe fallback to BookingAlertActivity

### Demo Login for Reviewers
- **Phone**: 9999999999
- **Auto-login**: demo@didisnow.app / DemoPartner2025!
- Shows dismissible "Demo Mode" banner
- Stable demo worker profile in Supabase
- Full app functionality available

### Developer Contact
- **Email**: team@didisnow.com
- **Phone**: +91 80081 80018

## 🔄 What Happens on App Install

1. User installs app → No automatic popups
2. User opens app → Login/signup screen shown
3. User logs in → Home screen with availability toggle
4. User receives booking alert:
   - If overlay permission granted → System overlay shows
   - If overlay permission denied → BookingAlertActivity (full-screen) shows
   - Notification shown in notification drawer

## 📱 Notification Flow (Play Store Compliant)

1. FCM message received → MyFirebaseService processes
2. Check overlay permission:
   - **Granted**: Shows BookingOverlayService
   - **Denied**: Falls back to BookingAlertActivity + shows heads-up notification
3. No automatic permission requests on startup
4. No intrusive behavior

## 🛡️ Security & Privacy

- All permissions tied to visible user actions
- No background location tracking
- No automatic service startup on boot
- No battery optimization bypass requests
- RLS policies enabled on all database tables
- JWT tokens stored securely in native storage
- Phone authentication with OTP
- Demo mode for reviewers (no real data exposure)

## 📋 Data Safety Form Requirements

**Permissions requested:**
1. **Notifications** - For booking alerts
2. **Internet** - For API communication
3. **Boot Completed** - For device state awareness only

**Data collected:**
- Phone number (authentication)
- Name (profile)
- Service types (worker capabilities)
- Location (community selection, not GPS)
- UPI ID (payment info, optional)

**Data shared:** None
**Data encrypted:** Yes (HTTPS, JWT)
**User can request deletion:** Yes

## 🎯 Key Features for Store Listing

1. **Real-time Booking Alerts** - Instant notifications for new bookings
2. **Availability Management** - Easy on/off toggle for work status
3. **Earnings Tracking** - View total earnings and completed jobs
4. **Multi-community Support** - Work across multiple service areas
5. **Multiple Services** - Maid, Cook, Bathroom Cleaning
6. **In-app Calling** - Direct communication with customers
7. **Demo Mode** - Try before creating account

## ✅ Final Checks Before Submission

- [x] Version updated to 1.0.6 (versionCode 7)
- [x] All high-risk permissions removed
- [x] No automatic permission requests on launch
- [x] Notification messages neutral and professional
- [x] Demo login configured for reviewers
- [x] Fallback mechanisms for denied permissions
- [x] BootReceiver only logs (no service startup)
- [x] Developer contact info added to app
- [x] Privacy Policy URL: https://759fb1e2-47be-4ebf-9bb7-b8afd005a404.lovableproject.com/privacy-policy
- [x] Terms of Service URL: https://759fb1e2-47be-4ebf-9bb7-b8afd005a404.lovableproject.com/terms-of-service

## 📦 Next Steps

1. **Generate Signed APK/AAB**:
   ```bash
   cd android
   ./gradlew bundleRelease
   # or
   ./gradlew assembleRelease
   ```

2. **Upload to Play Console**:
   - Go to Google Play Console
   - Create new release
   - Upload AAB file
   - Fill Data Safety form
   - Add screenshots (see demo mode at phone 9999999999)
   - Submit for review

3. **Reviewer Instructions**:
   - Enter phone: 9999999999
   - Auto-logged in as demo account
   - Full functionality available
   - Demo banner shows at top (dismissible)

## 🚨 Important Notes

- **Demo credentials must work**: Test before submission
- **Overlay fallback tested**: BookingAlertActivity works without overlay permission
- **No crashes on permission denial**: All flows handle denials gracefully
- **Console logs preserved**: For production debugging (errors only)
- **Play Store policies**: Fully compliant with Android 15 requirements
