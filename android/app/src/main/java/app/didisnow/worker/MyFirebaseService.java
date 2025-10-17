package app.didisnow.worker;

import android.content.Intent;
import android.os.Build;
import android.util.Log;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseService extends FirebaseMessagingService {
  private static final String TAG = "MyFirebaseService";

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
      
      // Create intent for BookingOverlayService (foreground service)
      Intent serviceIntent = new Intent(this, BookingOverlayService.class);
      serviceIntent.putExtra("booking_id", bookingId);
      serviceIntent.putExtra("customer_name", customer != null ? customer : "New Customer");
      serviceIntent.putExtra("community", community != null ? community : "");
      serviceIntent.putExtra("service_type", serviceType != null ? serviceType : "Service");
      serviceIntent.putExtra("flat_no", location != null ? location : "");
      serviceIntent.putExtra("price_inr", 0);
      
      // Start the foreground service
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Log.d(TAG, "📱 Starting foreground service (Android O+)");
        startForegroundService(serviceIntent);
      } else {
        Log.d(TAG, "📱 Starting service (pre Android O)");
        startService(serviceIntent);
      }
      
      Log.d(TAG, "✅ BookingOverlayService started - overlay should appear");
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
}
