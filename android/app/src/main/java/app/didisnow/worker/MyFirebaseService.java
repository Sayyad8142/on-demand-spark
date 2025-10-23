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
      Log.d(TAG, "🚨 BOOKING_ALERT detected! Launching BookingAlertActivity...");
      
      // Get booking data
      String bookingId = message.getData().get("bookingId");
      if (bookingId == null) {
        bookingId = message.getData().get("booking_id");
      }
      String customer = message.getData().get("customer");
      String community = message.getData().get("community");
      String serviceType = message.getData().get("serviceType");
      String location = message.getData().get("location");
      
      Log.d(TAG, "📋 Booking details from FCM:");
      Log.d(TAG, "   bookingId: " + bookingId);
      Log.d(TAG, "   customer: " + customer);
      Log.d(TAG, "   community: " + community);
      Log.d(TAG, "   serviceType: " + serviceType);
      Log.d(TAG, "   location: " + location);
      
      // Create notification channel for Android O+
      createNotificationChannel();
      
      // Create intent for BookingAlertActivity with direct launch
      Intent activityIntent = new Intent(this, BookingAlertActivity.class);
      activityIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | 
                              Intent.FLAG_ACTIVITY_CLEAR_TOP | 
                              Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
      activityIntent.putExtra("booking_id", bookingId);
      activityIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
      activityIntent.putExtra("community", community != null ? community : "");
      activityIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
      activityIntent.putExtra("flat_no", location != null ? location : "");
      activityIntent.putExtra("price_inr", 0);
      
      // Launch activity immediately (works even when app is in background)
      try {
        startActivity(activityIntent);
        Log.d(TAG, "✅ BookingAlertActivity launched directly");
      } catch (Exception e) {
        Log.e(TAG, "❌ Failed to launch activity directly: " + e.getMessage());
      }
      
      // Also create full-screen notification as backup
      PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
        this,
        0,
        activityIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      
      String title = "New Booking Request!";
      String text = customer + " • " + community + " • " + serviceType;
      
      NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(title)
        .setContentText(text)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setAutoCancel(true)
        .setFullScreenIntent(fullScreenPendingIntent, true)
        .setContentIntent(fullScreenPendingIntent);
      
      NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (notificationManager != null) {
        notificationManager.notify(NOTIFICATION_ID, notificationBuilder.build());
        Log.d(TAG, "✅ Full-screen notification also sent as backup");
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
      
      NotificationManager notificationManager = getSystemService(NotificationManager.class);
      if (notificationManager != null) {
        notificationManager.createNotificationChannel(channel);
      }
    }
  }
}
