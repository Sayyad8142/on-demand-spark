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
            
            // Check if user was logged in before reboot
            val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
            val wasLoggedIn = prefs.getBoolean("is_logged_in", false)
            
            Log.d("BootReceiver", "Device booted, was logged in: $wasLoggedIn")
            
            if (wasLoggedIn) {
                val serviceIntent = Intent(context, BookingForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d("BootReceiver", "BookingForegroundService restarted after boot")
            }
        }
    }
}
