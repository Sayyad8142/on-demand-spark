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
      
      // Get booking data
      String bookingId = message.getData().get("bookingId");
      String customer = message.getData().get("customer");
      String community = message.getData().get("community");
      String serviceType = message.getData().get("serviceType");
      String location = message.getData().get("location");
      
      Log.d(TAG, "📋 Booking details:");
      Log.d(TAG, "  ID: " + bookingId);
      Log.d(TAG, "  Customer: " + customer);
      Log.d(TAG, "  Community: " + community);
      Log.d(TAG, "  Service: " + serviceType);
      Log.d(TAG, "  Location: " + location);
      
      // Start BookingOverlayService to show system overlay
      Intent serviceIntent = new Intent(this, BookingOverlayService.class);
      serviceIntent.putExtra("booking_id", bookingId);
      serviceIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
      serviceIntent.putExtra("community", community != null ? community : "");
      serviceIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
      serviceIntent.putExtra("flat_no", location != null ? location : "");
      serviceIntent.putExtra("price_inr", 0);
      
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
}
