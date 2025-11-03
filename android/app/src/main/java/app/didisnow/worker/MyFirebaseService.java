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
        Log.d(TAG, "🚨 BOOKING_ALERT detected! Starting BookingAlertActivity...");
        
        // Extract booking data using new unified keys
        String bookingId = message.getData().get("booking_id");
        String serviceType = message.getData().get("service_type");
        String flatNumber = message.getData().get("flat_number");
        String priceInr = message.getData().get("price_inr");
        String notes = message.getData().get("notes");
        String community = message.getData().get("community");
        String imageUrl = message.getData().get("image_url");
        
        Log.d(TAG, "📋 Booking details:");
        Log.d(TAG, "  ID: " + bookingId);
        Log.d(TAG, "  Service: " + serviceType);
        Log.d(TAG, "  Flat: " + flatNumber);
        Log.d(TAG, "  Price: ₹" + priceInr);
        Log.d(TAG, "  Community: " + community);
        Log.d(TAG, "  Notes: " + notes);
        
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
        
        // Start BookingAlertActivity directly with unified keys
        Intent activityIntent = new Intent(this, BookingAlertActivity.class);
        activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        activityIntent.putExtra("booking_id", bookingId != null ? bookingId : "");
        activityIntent.putExtra("service_type", serviceType != null ? serviceType : "");
        activityIntent.putExtra("flat_number", flatNumber != null ? flatNumber : "");
        activityIntent.putExtra("price_inr", priceInr != null ? priceInr : "0");
        activityIntent.putExtra("notes", notes != null ? notes : "");
        activityIntent.putExtra("community", community != null ? community : "Prestige High Fields");
        activityIntent.putExtra("image_url", imageUrl != null ? imageUrl : "");
        
        Log.d(TAG, "🚀 Starting BookingAlertActivity...");
        
        try {
          startActivity(activityIntent);
          Log.d(TAG, "✅ BookingAlertActivity started successfully");
        } catch (Exception e) {
          Log.e(TAG, "❌ Failed to start BookingAlertActivity", e);
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
