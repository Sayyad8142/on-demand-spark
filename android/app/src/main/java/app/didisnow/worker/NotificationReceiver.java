package app.didisnow.worker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * NotificationReceiver — handles taps on system notification action buttons.
 *
 * Fix 5: Accept action now opens the app to the home screen so the worker
 * can act on the booking via the normal overlay/UI flow. We do NOT call
 * the booking-accept API directly from here because we lack a valid
 * Supabase session in this context.
 *
 * Reject is a no-op dismiss — closes the notification silently.
 */
public class NotificationReceiver extends BroadcastReceiver {
    private static final String TAG = "NotificationReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Notification action received: " + intent.getAction());
        
        String action = intent.getAction();
        if (action == null) return;

        // Dismiss the notification regardless of action
        android.app.NotificationManager nm =
            (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        int notifId = intent.getIntExtra("notificationId", 12345);
        if (nm != null) {
            nm.cancel(notifId);
        }

        switch (action) {
            case "ACTION_ACCEPT":
                String bookingId = intent.getStringExtra("bookingId");
                Log.d(TAG, "Accept action for booking: " + bookingId + " — opening app");
                // Open the app so worker can accept via overlay/UI
                Intent launchIntent = context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName());
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    launchIntent.putExtra("navigate_to", "bookings");
                    if (bookingId != null) {
                        launchIntent.putExtra("booking_id", bookingId);
                    }
                    context.startActivity(launchIntent);
                }
                break;
                
            case "ACTION_REJECT":
                Log.d(TAG, "Reject/dismiss action — notification dismissed");
                // Notification already cancelled above; nothing else to do.
                break;
                
            default:
                Log.d(TAG, "Unknown action: " + action);
                break;
        }
    }
}
