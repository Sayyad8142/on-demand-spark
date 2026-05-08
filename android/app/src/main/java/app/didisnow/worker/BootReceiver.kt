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
                // No FCM-only foreground service — FCM handles notifications.
                Log.d("BootReceiver", "Device booted, FCM handles notifications")

                // Restart movement tracking foreground service in passive mode
                // so step tracking survives reboot. The actual workerId is unknown
                // here; JS-side App.tsx will re-issue startPassiveMovementMonitoring
                // with the correct workerId when it loads — this just keeps the
                // service warm if the worker was online before reboot.
                if (wasAvailable) {
                    try {
                        MovementTrackingService.startPassive(context, "passive:boot")
                        Log.d("BootReceiver", "MovementTrackingService restarted (passive boot warm-up)")
                    } catch (e: Exception) {
                        Log.w("BootReceiver", "Could not warm-up MovementTrackingService: ${e.message}")
                    }

                    val locationServiceIntent = Intent(context, LocationTrackingService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(locationServiceIntent)
                    } else {
                        context.startService(locationServiceIntent)
                    }
                    LocationUpdateWorker.schedule(context)
                    Log.d("BootReceiver", "LocationTrackingService restarted after boot")
                }
            }
        }
    }
}
