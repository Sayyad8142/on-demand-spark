# Android Native Setup (after export)

This guide covers how to add native Android capabilities to the Didi Now Worker app after exporting from Lovable.

## Prerequisites

- Node.js and npm installed
- Android Studio installed
- Firebase project created with FCM enabled
- `google-services.json` file from Firebase Console

## Step 1: Install Capacitor

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/push-notifications
```

## Step 2: Initialize Capacitor

```bash
npx cap init "Didi Now Worker" "app.didisnow.worker"
```

This will create a `capacitor.config.ts` file in your project root.

## Step 3: Add Android Platform

```bash
npx cap add android
```

This creates an `android/` directory with a native Android project.

## Step 4: Build Web Assets

```bash
npm run build
npx cap sync android
```

This copies your web assets into the Android project.

## Step 5: Configure Firebase

1. Place `google-services.json` in `android/app/` directory

2. Edit `android/build.gradle` to add Google Services plugin:

```gradle
buildscript {
    dependencies {
        // ... existing dependencies
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

3. Edit `android/app/build.gradle`:

```gradle
plugins {
    id 'com.android.application'
    id 'com.google.gms.google-services'  // Add this
}

dependencies {
    // ... existing dependencies
    
    // Firebase Cloud Messaging
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-messaging'
    
    // For overlay service
    implementation 'androidx.core:core-ktx:1.12.0'
}
```

## Step 6: Configure AndroidManifest.xml

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Required Permissions -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
    <uses-permission android:name="android.permission.WAKE_LOCK"/>
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <!-- Main Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

        <!-- Firebase Messaging Service -->
        <service
            android:name=".MyFirebaseService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT"/>
            </intent-filter>
        </service>

        <!-- Booking Alert Activity (Full-screen overlay) -->
        <activity
            android:name=".BookingAlertActivity"
            android:excludeFromRecents="true"
            android:exported="false"
            android:launchMode="singleTask"
            android:showWhenLocked="true"
            android:taskAffinity=""
            android:theme="@style/Theme.AppCompat.Light.Dialog"/>

        <!-- Booking Overlay Service (Foreground) -->
        <service
            android:name=".BookingOverlayService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Booking alerts"/>
        </service>

    </application>
</manifest>
```

## Step 7: Implement Native Overlay Plugin

Create `android/app/src/main/java/app/didisnow/worker/OverlayPlugin.java`:

```java
package app.didisnow.worker;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "OverlayPlugin")
public class OverlayPlugin extends Plugin {

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean hasPermission = Settings.canDrawOverlays(getContext());
        JSObject ret = new JSObject();
        ret.put("hasPermission", hasPermission);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "overlayPermissionResult");
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void showBookingOverlay(PluginCall call) {
        String bookingId = call.getString("bookingId");
        String service = call.getString("service");
        String customer = call.getString("customer");
        String location = call.getString("location");
        int price = call.getInt("price", 0);
        int timeoutSec = call.getInt("timeoutSec", 30);

        Intent intent = new Intent(getContext(), BookingOverlayService.class);
        intent.putExtra("bookingId", bookingId);
        intent.putExtra("service", service);
        intent.putExtra("customer", customer);
        intent.putExtra("location", location);
        intent.putExtra("price", price);
        intent.putExtra("timeoutSec", timeoutSec);
        
        getContext().startForegroundService(intent);
        call.resolve();
    }

    @PluginMethod
    public void hideOverlay(PluginCall call) {
        Intent intent = new Intent(getContext(), BookingOverlayService.class);
        getContext().stopService(intent);
        call.resolve();
    }
}
```

## Step 8: Implement Firebase Messaging Service

The `MyFirebaseService.java` should already exist in your project. Ensure it handles FCM messages and triggers the overlay service.

## Step 9: Build and Test

### Open in Android Studio

```bash
npx cap open android
```

### Build APK

In Android Studio:
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. Or run: `./gradlew assembleDebug` from the `android/` directory

### Install on Device

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Step 10: QA Checklist

Test the following scenarios on physical devices (especially OEM devices like Xiaomi, OnePlus, Vivo, Oppo):

### Basic Functionality
- [ ] App launches successfully
- [ ] Login with phone OTP works
- [ ] Availability toggle works
- [ ] Bookings list loads correctly

### Push Notifications
- [ ] Permission request shown on first launch
- [ ] FCM token generated and saved to database
- [ ] Foreground push shows notification
- [ ] Background push wakes app and shows overlay
- [ ] App killed state: push wakes app and shows overlay

### Overlay Functionality
- [ ] Overlay permission request works
- [ ] Full-screen overlay shows when push received
- [ ] Accept button works (booking assigned)
- [ ] Reject button works (booking rejected)
- [ ] 30s countdown auto-rejects
- [ ] Sound plays on overlay show

### OEM-Specific Testing
- [ ] **Xiaomi**: Autostart enabled, battery optimization disabled
- [ ] **OnePlus**: Battery optimization disabled
- [ ] **Vivo**: Background processes allowed
- [ ] **Oppo**: Battery optimization disabled, screen overlay enabled
- [ ] **Samsung**: Sleeping apps exclusion, background activity allowed

### Edge Cases
- [ ] Multiple rapid bookings (queue behavior)
- [ ] Poor network conditions
- [ ] Low battery mode
- [ ] Do Not Disturb mode
- [ ] Multiple worker accounts on same device

## Troubleshooting

### FCM Token Not Generated
- Check `google-services.json` is in correct location
- Verify Firebase project configuration
- Check internet connection
- Review logcat for errors: `adb logcat | grep FCM`

### Overlay Not Showing
- Verify overlay permission granted: Settings → Apps → Didi Now Worker → Display over other apps
- Check battery optimization disabled
- Verify foreground service is running: `adb shell dumpsys activity services`

### Push Not Received in Background
- Check autostart permission (OEM specific)
- Verify battery optimization disabled
- Check notification permissions granted
- Review Firebase Console for delivery status

### Build Errors
- Clean build: `./gradlew clean`
- Sync Gradle: File → Sync Project with Gradle Files
- Invalidate caches: File → Invalidate Caches / Restart

## Production Considerations

1. **Sign APK**: Use release keystore for production builds
2. **ProGuard**: Configure rules for Capacitor and Firebase
3. **FCM Topic Subscription**: Subscribe workers to community/service topics
4. **Analytics**: Add Firebase Analytics for monitoring
5. **Crash Reporting**: Integrate Firebase Crashlytics
6. **Rate Limiting**: Implement server-side throttling for push notifications
7. **Testing**: Use Firebase Test Lab for device coverage

## Additional Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Android Overlay Permission](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW)
- [Battery Optimization](https://developer.android.com/training/monitoring-device-state/doze-standby)
