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
      Log.d(TAG, "🚨 BOOKING_ALERT detected! Starting overlay service...");
      
      Intent svc = new Intent(this, BookingOverlayService.class);
      
      // Map FCM data payload to service intent extras
      String bookingId = message.getData().get("bookingId");
      if (bookingId == null) {
        bookingId = message.getData().get("booking_id"); // fallback
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
      
      svc.putExtra("booking_id", bookingId);
      svc.putExtra("customer_name", customer != null ? customer : "New Customer");
      svc.putExtra("community", community != null ? community : "");
      svc.putExtra("service_type", serviceType != null ? serviceType : "Service");
      svc.putExtra("flat_no", location != null ? location : "");
      svc.putExtra("price_inr", 0); // Price not available in FCM payload
      
      // Get title and body from notification payload if available
      String title = "New Booking";
      String body = "";
      
      if (message.getNotification() != null) {
        if (message.getNotification().getTitle() != null) {
          title = message.getNotification().getTitle();
        }
        if (message.getNotification().getBody() != null) {
          body = message.getNotification().getBody();
        }
      }
      
      Log.d(TAG, "📬 Notification: " + title + " - " + body);
      
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Log.d(TAG, "📲 Starting foreground service (Android O+)");
        startForegroundService(svc);
      } else {
        Log.d(TAG, "📲 Starting service (pre-O)");
        startService(svc);
      }
      
      Log.d(TAG, "✅ Overlay service start command sent successfully");
    } else {
      Log.d(TAG, "⏭️ Not a BOOKING_ALERT, type: " + type + " - skipping overlay");
    }
  }

  @Override
  public void onNewToken(String token) {
    Log.d(TAG, "🔑 New FCM token received: " + token.substring(0, Math.min(30, token.length())) + "...");
    Log.d(TAG, "💡 Token should be saved by Capacitor PushNotifications plugin");
    // Token is already handled by Capacitor PushNotifications plugin
  }
}
