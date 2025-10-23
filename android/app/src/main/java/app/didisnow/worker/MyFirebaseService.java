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
      
      Log.d(TAG, "📋 Booking details:");
      Log.d(TAG, "  ID: " + bookingId);
      Log.d(TAG, "  Customer: " + customer);
      Log.d(TAG, "  Community: " + community);
      Log.d(TAG, "  Service: " + serviceType);
      Log.d(TAG, "  Location: " + location);
      
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
      serviceIntent.putExtra("price_inr", 0);
      
      Log.d(TAG, "🚀 Starting BookingOverlayService with mode=show...");
      
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          startForegroundService(serviceIntent);
        } else {
          startService(serviceIntent);
        }
        Log.d(TAG, "✅ BookingOverlayService started successfully");
      } catch (Exception e) {
        Log.e(TAG, "❌ Failed to start BookingOverlayService: " + e.getMessage());
        e.printStackTrace();
      }
    } else {
      Log.d(TAG, "⏭️ Not a BOOKING_ALERT, type: " + type + " - skipping");
    }
  }

  @Override
  public void onNewToken(String token) {
    Log.d(TAG, "🔑 New FCM token received: " + token.substring(0, Math.min(30, token.length())) + "...");
    Log.d(TAG, "💡 Token should be saved by Capacitor PushNotifications plugin");
    // Token is already handled by Capacitor PushNotifications plugin
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
