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
    Log.d(TAG, "📩 FCM message received");
    
    String type = message.getData().get("type");
    Log.d(TAG, "Message type: " + type);
    
    if ("BOOKING_ALERT".equals(type)) {
      Log.d(TAG, "🚨 Booking alert detected, starting overlay service");
      
      Intent svc = new Intent(this, BookingOverlayService.class);
      svc.putExtra("bookingId", message.getData().get("bookingId"));
      
      // Get title and body from notification or data payload
      String title = "New Booking";
      String body = "";
      
      if (message.getNotification() != null) {
        title = message.getNotification().getTitle();
        body = message.getNotification().getBody();
      } else {
        // Fallback to data payload
        String customer = message.getData().get("customer");
        String community = message.getData().get("community");
        String location = message.getData().get("location");
        body = community + " • " + location + " • " + customer;
      }
      
      svc.putExtra("title", title);
      svc.putExtra("body", body);
      
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(svc);
      } else {
        startService(svc);
      }
      
      Log.d(TAG, "✅ Overlay service started");
    } else {
      Log.d(TAG, "⏭️ Non-booking message, skipping overlay");
    }
  }

  @Override
  public void onNewToken(String token) {
    Log.d(TAG, "🔑 New FCM token: " + token);
    // Token is already handled by Capacitor PushNotifications plugin
  }
}
