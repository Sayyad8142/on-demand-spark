package app.didisnow.worker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseService extends FirebaseMessagingService {
  private static final String TAG = "MyFirebaseService";
  private static final String CHANNEL_ID = "booking_alerts";
  private static final int NOTIFICATION_ID = 12345;

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Log.d(TAG, "📩 FCM message received from: " + message.getFrom());
    Log.d(TAG, "📩 Message ID: " + message.getMessageId());
    Log.d(TAG, "📩 Data payload: " + message.getData().toString());
    
    if (message.getNotification() != null) {
      Log.d(TAG, "📬 Notification payload: " + message.getNotification().getTitle() + " - " + message.getNotification().getBody());
    }
    
    String type = message.getData().get("type");
    Log.d(TAG, "🏷️ Message type: " + type);
    
    try {
      if ("BOOKING_ALERT".equals(type)) {
        Log.d(TAG, "🚨 BOOKING_ALERT detected! Starting BookingOverlayService...");
        
        // Get booking data - try both field names for compatibility
        String bookingId = message.getData().get("bookingId");
        if (bookingId == null || bookingId.isEmpty()) {
          bookingId = message.getData().get("booking_id");
        }
        
        String customer = message.getData().get("customer");
        String community = message.getData().get("community");
        String serviceType = message.getData().get("serviceType");
        if (serviceType == null || serviceType.isEmpty()) {
          serviceType = message.getData().get("service_type");
        }
        String location = message.getData().get("location");
        String priceStr = message.getData().get("price");
        int price = 0;
        try {
          if (priceStr != null && !priceStr.isEmpty()) {
            price = Integer.parseInt(priceStr);
          }
        } catch (NumberFormatException e) {
          Log.w(TAG, "⚠️ Failed to parse price: " + priceStr, e);
        }
        
        Log.d(TAG, "📋 Booking details:");
        Log.d(TAG, "  ID: " + bookingId);
        Log.d(TAG, "  Customer: " + customer);
        Log.d(TAG, "  Community: " + community);
        Log.d(TAG, "  Service: " + serviceType);
        Log.d(TAG, "  Location: " + location);
        Log.d(TAG, "  Price: ₹" + price);
        
        // Validate critical data
        if (bookingId == null || bookingId.isEmpty()) {
          Log.e(TAG, "❌ CRITICAL: No bookingId in FCM payload! Cannot show overlay.");
          Log.e(TAG, "❌ Full data payload: " + message.getData().toString());
          return;
        }
        
        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          if (!android.provider.Settings.canDrawOverlays(this)) {
            Log.e(TAG, "❌ CRITICAL: No overlay permission! User must grant permission in Settings.");
            showPermissionNotification();
            return;
          } else {
            Log.d(TAG, "✅ Overlay permission granted");
          }
        }
        
        // Start BookingOverlayService to show system overlay
        Intent serviceIntent = new Intent(this, BookingOverlayService.class);
        serviceIntent.putExtra("mode", "show");
        serviceIntent.putExtra("booking_id", bookingId);
        serviceIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
        serviceIntent.putExtra("community", community != null ? community : "");
        serviceIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
        serviceIntent.putExtra("flat_no", location != null ? location : "");
        serviceIntent.putExtra("price_inr", price);
        
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
        
        Log.d(TAG, "🚀 Starting BookingOverlayService with mode=show...");
        
        try {
          // Use regular startService since BookingOverlayService is no longer a foreground service
          startService(serviceIntent);
          Log.d(TAG, "✅ BookingOverlayService started successfully");
        } catch (Exception se) {
          Log.e(TAG, "❌ startForegroundService failed, falling back to BookingAlertActivity", se);
          Intent activityIntent = new Intent(this, BookingAlertActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
          activityIntent.putExtras(serviceIntent);
          startActivity(activityIntent);
        }
      } else {
        Log.d(TAG, "⏭️ Not a BOOKING_ALERT, type: " + type + " - skipping");
      }
    } catch (Exception e) {
      Log.e(TAG, "❌ BOOKING_ALERT handling failed", e);
    }
  }

  @Override
  public void onNewToken(String token) {
    Log.d(TAG, "🔑 New FCM token received: " + token.substring(0, Math.min(30, token.length())) + "...");
    
    // Save token directly to Supabase
    new Thread(() -> {
      try {
        // Get user_id from session
        String sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
            .getString("didi-worker-session", null);
        
        if (sessionJson == null || sessionJson.isEmpty()) {
          Log.w(TAG, "⚠️ No session found, cannot save FCM token yet");
          // Save token locally for when user logs in
          getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
              .edit()
              .putString("pending_fcm_token", token)
              .apply();
          Log.d(TAG, "💾 Token saved locally, will sync when user logs in");
          return;
        }
        
        org.json.JSONObject session = new org.json.JSONObject(sessionJson);
        String accessToken = session.optString("access_token", "");
        String userId = session.optJSONObject("user") != null ? 
            session.getJSONObject("user").optString("id", "") : "";
        
        if (userId.isEmpty() || accessToken.isEmpty()) {
          Log.w(TAG, "⚠️ No user_id or access_token in session");
          return;
        }
        
        Log.d(TAG, "📤 Saving FCM token to Supabase for user: " + userId);
        
        // Save to fcm_tokens table
        java.net.URL url = new java.net.URL("https://paywwbuqycovjopryele.supabase.co/rest/v1/fcm_tokens");
        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o");
        conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        conn.setRequestProperty("Prefer", "resolution=merge-duplicates");
        conn.setDoOutput(true);
        
        org.json.JSONObject payload = new org.json.JSONObject();
        payload.put("user_id", userId);
        payload.put("token", token);
        
        java.io.OutputStream os = conn.getOutputStream();
        os.write(payload.toString().getBytes("UTF-8"));
        os.close();
        
        int responseCode = conn.getResponseCode();
        if (responseCode >= 200 && responseCode < 300) {
          Log.d(TAG, "✅ FCM token saved to fcm_tokens table");
          
          // Also update workers table
          url = new java.net.URL("https://paywwbuqycovjopryele.supabase.co/rest/v1/workers?user_id=eq." + userId);
          conn = (java.net.HttpURLConnection) url.openConnection();
          conn.setRequestMethod("PATCH");
          conn.setRequestProperty("Content-Type", "application/json");
          conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o");
          conn.setRequestProperty("Authorization", "Bearer " + accessToken);
          conn.setDoOutput(true);
          
          org.json.JSONObject workerPayload = new org.json.JSONObject();
          workerPayload.put("fcm_token", token);
          
          os = conn.getOutputStream();
          os.write(workerPayload.toString().getBytes("UTF-8"));
          os.close();
          
          responseCode = conn.getResponseCode();
          if (responseCode >= 200 && responseCode < 300) {
            Log.d(TAG, "✅ FCM token saved to workers table");
          } else {
            Log.e(TAG, "❌ Failed to update workers table: " + responseCode);
          }
        } else {
          Log.e(TAG, "❌ Failed to save FCM token: " + responseCode);
        }
        
        conn.disconnect();
      } catch (Exception e) {
        Log.e(TAG, "❌ Error saving FCM token to Supabase", e);
      }
    }).start();
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
}
