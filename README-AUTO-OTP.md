# Auto OTP Detection Feature

This app now includes automatic OTP detection for Android devices using Google's SMS Retriever API.

## How It Works

When you request an OTP on the sign-in or sign-up page, the app will automatically:
1. Start listening for incoming SMS messages
2. Detect 6-digit OTP codes from SMS messages
3. Auto-fill the OTP field
4. Show a toast notification confirming the auto-detection

## Setup Instructions

### For Development/Testing

1. **Export your project to GitHub** (use the "Export to GitHub" button in Lovable)

2. **Clone and setup locally:**
   ```bash
   git clone <your-repo-url>
   cd <your-project>
   npm install
   ```

3. **Add Android platform:**
   ```bash
   npx cap add android
   npx cap update android
   ```

4. **Build and sync:**
   ```bash
   npm run build
   npx cap sync
   ```

5. **Run on device/emulator:**
   ```bash
   npx cap run android
   ```

## Testing Auto OTP

1. Make sure you're running on a physical Android device (emulator SMS testing can be tricky)
2. Request an OTP from the sign-in or sign-up page
3. When the SMS arrives with your OTP code, the app will automatically detect and fill it
4. You'll see a toast message: "OTP Auto-detected - Code XXXXXX filled automatically"

## Technical Details

### SMS Format
The app can detect any 6-digit number in the SMS message. The OTP should be in this format:
```
Your OTP is 123456
```
or
```
123456 is your verification code
```

### Android Requirements
- **Minimum SDK:** 24 (Android 7.0)
- **Google Play Services:** Required (included via play-services-auth)
- **Permissions:** No special SMS permissions required! The SMS Retriever API works without READ_SMS permission

### Security
- The SMS Retriever API only allows the app to read SMS messages for a limited time (5 minutes)
- No permanent access to SMS messages
- No special permissions required from users
- Works with hashed app signatures for security

## Troubleshooting

### OTP Not Auto-Detected
1. Check console logs for "📱 SMS Retriever started" message
2. Ensure the SMS contains a clear 6-digit number
3. Make sure you're on a physical device (not emulator)
4. Check that Google Play Services is installed and updated

### Build Errors
If you see compilation errors after syncing:
```bash
cd android
./gradlew clean
cd ..
npx cap sync android
```

## Future Enhancements

- Support for different OTP lengths (currently 6 digits)
- Support for alphanumeric OTPs
- iOS support using OTPTextField
