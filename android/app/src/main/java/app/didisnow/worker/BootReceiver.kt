package app.didisnow.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED || 
            intent?.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            // Check if user was logged in and available before reboot
            val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
            val wasLoggedIn = prefs.getBoolean("is_logged_in", false)
            val wasAvailable = prefs.getBoolean("is_available", false)
            
            Log.d("BootReceiver", "Device booted, was logged in: $wasLoggedIn, was available: $wasAvailable")
            
            if (wasLoggedIn) {
                // No foreground service needed - FCM handles notifications
                Log.d("BootReceiver", "Device booted, no foreground service – FCM handles notifications")
                
                // If user was available, restart location tracking
                if (wasAvailable) {
                    val locationServiceIntent = Intent(context, LocationTrackingService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(locationServiceIntent)
                    } else {
                        context.startService(locationServiceIntent)
                    }
                    
                    // Also schedule WorkManager as backup
                    LocationUpdateWorker.schedule(context)
                    
                    Log.d("BootReceiver", "LocationTrackingService restarted after boot")
                }
            }
        }
    }
}
