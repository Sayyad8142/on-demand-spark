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

import java.util.Map;

public class MyFirebaseService extends FirebaseMessagingService {
  private static final String TAG = "MyFirebaseService";
  private static final String CHANNEL_ID = "booking_alerts";
  private static final int NOTIFICATION_ID = 12345;

  @Override
  public void onMessageReceived(RemoteMessage message) {
    Log.d(TAG, "═══════════════════════════════════════════════════════════");
    Log.d(TAG, "📩 FCM MESSAGE RECEIVED");
    Log.d(TAG, "═══════════════════════════════════════════════════════════");
    
    Map<String, String> data = message.getData();
    Log.d(TAG, "📦 DATA PAYLOAD: " + data.toString());
    
    String type = data.get("type");
    String bookingType = data.get("booking_type");
    
    try {
      if ("BOOKING_ALERT".equals(type)) {
        Log.d(TAG, "🚨 BOOKING_ALERT DETECTED");
        
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

        String flatNo = data.get("flat_no");
        if (flatNo == null || flatNo.isEmpty()) {
          flatNo = data.get("flatNo");
        }
        String location = data.get("location");
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

        String scheduledTime = data.get("scheduled_time");

        Log.d(TAG, "📋 BOOKING: ID=" + bookingId + ", Service=" + serviceType + ", Price=₹" + price);
        
        if (bookingId == null || bookingId.isEmpty()) {
          Log.e(TAG, "❌ No bookingId in FCM payload!");
          return;
        }
        
        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          if (!android.provider.Settings.canDrawOverlays(this)) {
            Log.e(TAG, "❌ No overlay permission - falling back to Activity");
            launchBookingAlertActivity(bookingId, customer, community, serviceType, flatNo, price, bookingType, scheduledTime);
            return;
          }
        }
        
        // Start BookingOverlayService - DO NOT pass access token
        // The overlay service will read the LATEST token from storage when needed
        Log.d(TAG, "🚀 Starting BookingOverlayService...");
        
        Intent serviceIntent = new Intent(this, BookingOverlayService.class);
        serviceIntent.putExtra("mode", "show");
        serviceIntent.putExtra("booking_id", bookingId);
        serviceIntent.putExtra("booking_type", bookingType != null ? bookingType : "instant");
        serviceIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
        serviceIntent.putExtra("community", community != null ? community : "");
        serviceIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
        serviceIntent.putExtra("flat_no", flatNo != null ? flatNo : "");
        serviceIntent.putExtra("price_inr", price);
        serviceIntent.putExtra("scheduled_time", scheduledTime != null ? scheduledTime : "");
        
        // NOTE: We intentionally do NOT pass ACCESS_TOKEN here
        // The overlay service will read the latest token from storage just-in-time
        // This prevents using stale tokens that could cause refresh conflicts
        
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
          } else {
            startService(serviceIntent);
          }
          Log.d(TAG, "✅ BookingOverlayService started");
        } catch (Exception se) {
          Log.e(TAG, "❌ startService failed, falling back to Activity", se);
          launchBookingAlertActivity(bookingId, customer, community, serviceType, flatNo, price, bookingType, scheduledTime);
        }
      } else {
        Log.d(TAG, "⏭️ Not a BOOKING_ALERT, type: " + type);
      }
    } catch (Exception e) {
      Log.e(TAG, "❌ BOOKING_ALERT handling failed", e);
    }
  }
  
  private void launchBookingAlertActivity(String bookingId, String customer, String community, 
                                           String serviceType, String location, int price,
                                           String bookingType, String scheduledTime) {
    Log.d(TAG, "🚀 Launching BookingAlertActivity as fallback");
    
    try {
      Intent activityIntent = new Intent(this, BookingAlertActivity.class);
      activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      activityIntent.putExtra("booking_id", bookingId);
      activityIntent.putExtra("booking_type", bookingType != null ? bookingType : "instant");
      activityIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
      activityIntent.putExtra("community", community != null ? community : "");
      activityIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
      activityIntent.putExtra("flat_no", location != null ? location : "");
      activityIntent.putExtra("price_inr", price);
      activityIntent.putExtra("scheduled_time", scheduledTime != null ? scheduledTime : "");
      
      // NOTE: Do NOT pass access token - Activity should read from storage if needed
      
      startActivity(activityIntent);
      Log.d(TAG, "✅ BookingAlertActivity launched");
    } catch (Exception e) {
      Log.e(TAG, "❌ Failed to launch BookingAlertActivity", e);
      showPermissionNotification();
    }
  }

  @Override
  public void onNewToken(String token) {
    Log.d(TAG, "🔑 New FCM token received");
    // Token handled by Capacitor PushNotifications plugin
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