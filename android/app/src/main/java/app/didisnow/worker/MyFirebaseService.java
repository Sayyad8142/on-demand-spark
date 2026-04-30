package app.didisnow.worker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class MyFirebaseService extends FirebaseMessagingService {
  private static final String TAG = "MyFirebaseService";
  private static final String CHANNEL_ID = "booking_alerts";
  private static final String CANCELLATION_CHANNEL_ID = "booking_cancellations_urgent";
  private static final int NOTIFICATION_ID = 12345;

  @Override
  public void onCreate() {
    super.onCreate();
    // Fix 2: Pre-create notification channel early so fallback notifications
    // never fail silently on Android 8+ due to missing channel.
    createNotificationChannel();
    createCancellationNotificationChannel();
  }

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Log.d(TAG, "═══════════════════════════════════════════════════════════");
    Log.d(TAG, "📩 FCM MESSAGE RECEIVED");
    Log.d(TAG, "═══════════════════════════════════════════════════════════");
    Log.d(TAG, "📩 From: " + message.getFrom());
    Log.d(TAG, "📩 Message ID: " + message.getMessageId());
    
    // Log the FULL data payload for debugging
    Map<String, String> data = message.getData();
    Log.d(TAG, "📦 FULL DATA PAYLOAD:");
    for (Map.Entry<String, String> entry : data.entrySet()) {
      Log.d(TAG, "   " + entry.getKey() + " = " + entry.getValue());
    }
    
    if (message.getNotification() != null) {
      Log.d(TAG, "📬 Notification payload present: " + message.getNotification().getTitle() + " - " + message.getNotification().getBody());
    } else {
      Log.d(TAG, "📬 No notification payload (data-only message) - GOOD for overlay!");
    }
    
    String type = data.get("type");
    String bookingType = data.get("booking_type"); // "instant" or "scheduled"
    Log.d(TAG, "🏷️ Message type: " + type);
    Log.d(TAG, "🏷️ Booking type: " + bookingType);
    
    try {
      if ("BOOKING_CANCELLED".equals(type)) {
        String bookingId = data.get("bookingId");
        if (bookingId == null || bookingId.isEmpty()) bookingId = data.get("booking_id");
        Log.w(TAG, "🚨 BOOKING_CANCELLED received for booking_id=" + bookingId);
        showCancellationNotification(bookingId);
        broadcastCancellationToWebView(bookingId);
        return;
      }

      // Handle BOOKING_ALERT for BOTH instant AND scheduled bookings
      if ("BOOKING_ALERT".equals(type)) {
        Log.d(TAG, "═══════════════════════════════════════════════════════════");
        Log.d(TAG, "🚨 BOOKING_ALERT DETECTED - " + (bookingType != null ? bookingType.toUpperCase() : "UNKNOWN") + " BOOKING");
        Log.d(TAG, "═══════════════════════════════════════════════════════════");
        
        // Get booking data - try both field names for compatibility
        String bookingId = data.get("bookingId");
        if (bookingId == null || bookingId.isEmpty()) {
          bookingId = data.get("booking_id");
        }
        
        String customer = data.get("customer");
        String community = data.get("community");
        String serviceType = data.get("serviceType");
        if (serviceType == null || serviceType.isEmpty()) {
          serviceType = data.get("service_type");
        }

        // Flat number is intentionally sent as `flat_no` (location is blanked for privacy)
        String flatNo = data.get("flat_no");
        if (flatNo == null || flatNo.isEmpty()) {
          flatNo = data.get("flatNo"); // legacy
        }
        String location = data.get("location"); // legacy/compat
        if ((flatNo == null || flatNo.isEmpty()) && location != null && !location.isEmpty()) {
          flatNo = location;
        }

        String priceStr = data.get("price");
        if (priceStr == null || priceStr.isEmpty()) {
          priceStr = data.get("price_inr");
        }
        if (priceStr == null || priceStr.isEmpty()) {
          priceStr = data.get("priceInr");
        }

        int price = 0;
        try {
          if (priceStr != null && !priceStr.isEmpty()) {
            // Support values like "200", "200.0", "₹200"
            String normalized = priceStr.replaceAll("[^0-9.]", "");
            if (!normalized.isEmpty()) {
              if (normalized.contains(".")) {
                price = (int) Math.round(Double.parseDouble(normalized));
              } else {
                price = Integer.parseInt(normalized);
              }
            }
          }
        } catch (Exception e) {
          Log.w(TAG, "⚠️ Failed to parse price: " + priceStr, e);
        }

        String scheduledTime = data.get("scheduled_time"); // Human-readable scheduled time
        String scheduledDate = data.get("scheduled_date");
        String scheduledTimeRaw = data.get("scheduled_time_raw");
        boolean prealertSent = "true".equalsIgnoreCase(data.get("prealert_sent"));

        Log.d(TAG, "📋 BOOKING DETAILS:");
        Log.d(TAG, "   ID: " + bookingId);
        Log.d(TAG, "   Type: " + bookingType);
        Log.d(TAG, "   Customer: " + customer);
        Log.d(TAG, "   Community: " + community);
        Log.d(TAG, "   Service: " + serviceType);
        Log.d(TAG, "   Flat No: " + flatNo);
        Log.d(TAG, "   Price: ₹" + price);
        if (scheduledTime != null && !scheduledTime.isEmpty()) {
          Log.d(TAG, "   Scheduled Time: " + scheduledTime);
        }
        Log.d(TAG, "   Scheduled At: " + scheduledDate + " " + scheduledTimeRaw);
        Log.d(TAG, "   Prealert Sent: " + prealertSent);
        
        // Validate critical data
        if (bookingId == null || bookingId.isEmpty()) {
          Log.e(TAG, "❌ CRITICAL: No bookingId in FCM payload! Cannot show overlay.");
          Log.e(TAG, "❌ Full data payload: " + data.toString());
          return;
        }

        if ("scheduled".equals(bookingType) && !prealertSent) {
          Log.w(TAG, "🔕 Scheduled booking hidden until prealert_sent=true. booking_id=" + bookingId
              + ", scheduled_at=" + scheduledDate + "T" + scheduledTimeRaw
              + ", request_status=" + data.get("request_status")
              + ", shown_to_worker=false");
          return;
        }

        showBookingNotification(bookingId, bookingType);
        
        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          if (!android.provider.Settings.canDrawOverlays(this)) {
            Log.e(TAG, "❌ CRITICAL: No overlay permission! Falling back to Activity.");
            // Try to show BookingAlertActivity as fallback
            launchBookingAlertActivity(bookingId, customer, community, serviceType, flatNo, price, bookingType, scheduledTime, prealertSent);
            return;
          } else {
            Log.d(TAG, "✅ Overlay permission granted");
          }
        }
        
        // Start BookingOverlayService to show system overlay
        // This works for BOTH instant AND scheduled bookings!
        Log.d(TAG, "🚀 Starting BookingOverlayService for " + bookingType + " booking...");
        
        Intent serviceIntent = new Intent(this, BookingOverlayService.class);
        serviceIntent.putExtra("mode", "show");
        serviceIntent.putExtra("booking_id", bookingId);
        serviceIntent.putExtra("booking_type", bookingType != null ? bookingType : "instant");
        serviceIntent.putExtra("prealert_sent", prealertSent);
        serviceIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
        serviceIntent.putExtra("community", community != null ? community : "");
        serviceIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
        serviceIntent.putExtra("flat_no", flatNo != null ? flatNo : "");
        serviceIntent.putExtra("price_inr", price);
        serviceIntent.putExtra("scheduled_time", scheduledTime != null ? scheduledTime : "");
        
        // Try to get access token from SharedPreferences to pass via Intent
        try {
          String sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
              .getString("didi_session", null);
          if (sessionJson != null && !sessionJson.isEmpty()) {
            org.json.JSONObject session = new org.json.JSONObject(sessionJson);
            String accessToken = session.optString("accessToken", "");
            if (!accessToken.isEmpty()) {
              serviceIntent.putExtra("ACCESS_TOKEN", accessToken);
              Log.d(TAG, "✅ Access token loaded and will be passed to overlay service");
            } else {
              Log.w(TAG, "⚠️ No accessToken in session JSON");
            }
          } else {
            Log.w(TAG, "⚠️ No session found in SharedPreferences");
          }
        } catch (Exception e) {
          Log.e(TAG, "❌ Failed to read session for token", e);
        }
        
        Log.d(TAG, "🚀 Starting BookingOverlayService with mode=show for " + bookingType + " booking...");
        
        try {
          // Use regular startService since BookingOverlayService is no longer a foreground service
          startService(serviceIntent);
          Log.d(TAG, "✅ BookingOverlayService started successfully for " + bookingType + " booking!");
        } catch (Exception se) {
          Log.e(TAG, "❌ startService failed, falling back to BookingAlertActivity", se);
          launchBookingAlertActivity(bookingId, customer, community, serviceType, location, price, bookingType, scheduledTime, prealertSent);
        }
      } else {
        Log.d(TAG, "⏭️ Not a BOOKING_ALERT, type: " + type + " - skipping overlay");
      }
    } catch (Exception e) {
      Log.e(TAG, "❌ BOOKING_ALERT handling failed", e);
    }
  }
  
  /**
   * Launch BookingAlertActivity as fallback when overlay permission is not granted
   * or when starting the overlay service fails.
   * Works for BOTH instant AND scheduled bookings.
   */
  private void launchBookingAlertActivity(String bookingId, String customer, String community, 
                                           String serviceType, String location, int price,
                                            String bookingType, String scheduledTime, boolean prealertSent) {
    Log.d(TAG, "🚀 Launching BookingAlertActivity as fallback for " + bookingType + " booking");
    
    try {
      Intent activityIntent = new Intent(this, BookingAlertActivity.class);
      activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      activityIntent.putExtra("booking_id", bookingId);
      activityIntent.putExtra("booking_type", bookingType != null ? bookingType : "instant");
      activityIntent.putExtra("prealert_sent", prealertSent);
      activityIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
      activityIntent.putExtra("community", community != null ? community : "");
      activityIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
      activityIntent.putExtra("flat_no", location != null ? location : "");
      activityIntent.putExtra("price_inr", price);
      activityIntent.putExtra("scheduled_time", scheduledTime != null ? scheduledTime : "");
      
      // Pass access token
      try {
        String sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
            .getString("didi_session", null);
        if (sessionJson != null && !sessionJson.isEmpty()) {
          org.json.JSONObject session = new org.json.JSONObject(sessionJson);
          String accessToken = session.optString("accessToken", "");
          if (!accessToken.isEmpty()) {
            activityIntent.putExtra("ACCESS_TOKEN", accessToken);
          }
        }
      } catch (Exception e) {
        Log.e(TAG, "❌ Failed to read session for activity token", e);
      }
      
      startActivity(activityIntent);
      Log.d(TAG, "✅ BookingAlertActivity launched successfully for " + bookingType + " booking");
    } catch (Exception e) {
      Log.e(TAG, "❌ Failed to launch BookingAlertActivity", e);
      showPermissionNotification();
    }
  }

  @Override
  public void onNewToken(String token) {
    Log.d(TAG, "🔑 New FCM token received: " + token.substring(0, Math.min(30, token.length())) + "...");
    
    // RELIABILITY FIX: Persist token natively so it survives backgrounded/killed states.
    // The JS layer will pick this up on next app start via AuthBridge.getPendingFCMToken()
    // and sync it to both `workers.fcm_token` (primary) and `fcm_tokens` table (fallback).
    try {
      android.content.SharedPreferences prefs = getSharedPreferences("worker_prefs", MODE_PRIVATE);
      String previousToken = prefs.getString("pending_fcm_token", null);
      
      // Only write if token actually changed (avoid noisy repeated writes)
      if (!token.equals(previousToken)) {
        boolean saved = prefs.edit()
            .putString("pending_fcm_token", token)
            .putLong("pending_fcm_token_timestamp", System.currentTimeMillis())
            .commit(); // commit() = synchronous, guaranteed before method returns
        
        if (saved) {
          Log.d(TAG, "✅ FCM token persisted to SharedPreferences for JS sync");
        } else {
          Log.e(TAG, "❌ Failed to persist FCM token to SharedPreferences");
        }
      } else {
        Log.d(TAG, "ℹ️ FCM token unchanged, skipping SharedPreferences write");
      }
    } catch (Exception e) {
      Log.e(TAG, "❌ Exception persisting FCM token", e);
    }
  }
  
  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      CharSequence name = "Booking Alerts";
      String description = "Urgent booking notifications";
      int importance = NotificationManager.IMPORTANCE_HIGH;
      NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
      channel.setDescription(description);
      channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
      channel.enableVibration(true);
      channel.setBypassDnd(true);
      
      NotificationManager notificationManager = getSystemService(NotificationManager.class);
      if (notificationManager != null) {
        notificationManager.createNotificationChannel(channel);
        Log.d(TAG, "✅ Notification channel created with HIGH importance");
      }
    }
  }

  private void createCancellationNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.booking_cancellation_voice);
      AudioAttributes audioAttributes = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
      NotificationChannel channel = new NotificationChannel(
        CANCELLATION_CHANNEL_ID,
        "Urgent booking cancellations",
        NotificationManager.IMPORTANCE_HIGH
      );
      channel.setDescription("Loud cancellation alerts for assigned workers");
      channel.setSound(soundUri, audioAttributes);
      channel.enableVibration(true);
      channel.setVibrationPattern(new long[]{0, 700, 200, 700, 200, 1000});
      channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
      channel.setBypassDnd(true);

      NotificationManager notificationManager = getSystemService(NotificationManager.class);
      if (notificationManager != null) {
        notificationManager.createNotificationChannel(channel);
        Log.d(TAG, "✅ Cancellation notification channel created");
      }
    }
  }

  private void broadcastCancellationToWebView(String bookingId) {
    try {
      Intent intent = new Intent("BOOKING_CANCELLED_ALERT");
      intent.putExtra("booking_id", bookingId != null ? bookingId : "");
      LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
      Log.d(TAG, "📣 Cancellation broadcast sent to MainActivity");
    } catch (Exception e) {
      Log.e(TAG, "❌ Failed to broadcast cancellation", e);
    }
  }
  
  private void showPermissionNotification() {
    createNotificationChannel();
    
    Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent pendingIntent = PendingIntent.getActivity(
      this, 0, intent, PendingIntent.FLAG_IMMUTABLE
    );
    
    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("⚠️ Overlay Permission Required")
      .setContentText("Enable 'Display over other apps' to receive booking alerts")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent);
    
    NotificationManager notificationManager = getSystemService(NotificationManager.class);
    if (notificationManager != null) {
      notificationManager.notify(NOTIFICATION_ID + 1, builder.build());
    }
  }

  private void showBookingNotification(String bookingId, String bookingType) {
    createNotificationChannel();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "🔕 Booking notification not shown: POST_NOTIFICATIONS denied. booking_id=" + bookingId);
      return;
    }

    Intent intent = new Intent(this, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    intent.putExtra("navigate_to", "bookings");
    intent.putExtra("booking_id", bookingId);

    PendingIntent pendingIntent = PendingIntent.getActivity(
      this,
      bookingId != null ? bookingId.hashCode() : NOTIFICATION_ID,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("New Booking")
      .setContentText("New Booking")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent);

    NotificationManager notificationManager = getSystemService(NotificationManager.class);
    if (notificationManager != null) {
      try {
        notificationManager.notify(bookingId != null ? bookingId.hashCode() : NOTIFICATION_ID, builder.build());
        Log.d(TAG, "✅ Booking tray notification shown. booking_id=" + bookingId + ", booking_type=" + bookingType);
      } catch (SecurityException e) {
        Log.w(TAG, "🔕 Booking notification blocked by Android permission. booking_id=" + bookingId, e);
      }
    }
  }

  private void showCancellationNotification(String bookingId) {
    createCancellationNotificationChannel();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "🔕 Cancellation notification not shown: POST_NOTIFICATIONS denied. booking_id=" + bookingId);
      return;
    }

    Intent intent = new Intent(this, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    intent.putExtra("navigate_to", "home");
    intent.putExtra("booking_id", bookingId);
    intent.putExtra("alert_type", "BOOKING_CANCELLED");

    PendingIntent pendingIntent = PendingIntent.getActivity(
      this,
      bookingId != null ? bookingId.hashCode() : NOTIFICATION_ID + 2,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.booking_cancellation_voice);
    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CANCELLATION_CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("BOOKING CANCELLED")
      .setContentText("Your booking was cancelled. Do not go to the flat.")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setVibrate(new long[]{0, 700, 200, 700, 200, 1000})
      .setSound(soundUri)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent);

    NotificationManager notificationManager = getSystemService(NotificationManager.class);
    if (notificationManager != null) {
      try {
        notificationManager.notify(bookingId != null ? bookingId.hashCode() : NOTIFICATION_ID + 2, builder.build());
        Log.d(TAG, "✅ Cancellation notification shown. booking_id=" + bookingId);
      } catch (SecurityException e) {
        Log.w(TAG, "🔕 Cancellation notification blocked by Android permission. booking_id=" + bookingId, e);
      }
    }
  }
}
