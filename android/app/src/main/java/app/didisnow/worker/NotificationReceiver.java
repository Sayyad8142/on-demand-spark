package app.didisnow.worker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class NotificationReceiver extends BroadcastReceiver {
    private static final String TAG = "NotificationReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Notification action received: " + intent.getAction());
        
        String action = intent.getAction();
        if (action == null) return;

        switch (action) {
            case "ACTION_ACCEPT":
                String bookingId = intent.getStringExtra("bookingId");
                Log.d(TAG, "Accept action for booking: " + bookingId);
                // Handle accept action - could start MainActivity or call API
                break;
                
            case "ACTION_REJECT":
                Log.d(TAG, "Reject action");
                // Handle reject action
                break;
                
            default:
                Log.d(TAG, "Unknown action: " + action);
                break;
        }
    }
}
