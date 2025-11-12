package app.didisnow.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        // Only log device boot state - does NOT start any services
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "📱 Device booted - app ready for user interaction")
            Log.d("BootReceiver", "✅ No services auto-started (Play Store compliant)")
        }
    }
}
