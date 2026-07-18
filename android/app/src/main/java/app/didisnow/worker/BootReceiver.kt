package app.didisnow.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        WorkerLog.add(context, "BOOT", "Receiver fired action=$action")

        val isBoot = action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        val isPackageReplaced = action == Intent.ACTION_MY_PACKAGE_REPLACED

        if (!isBoot && !isPackageReplaced) return

        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val wasLoggedIn = prefs.getBoolean("is_logged_in", false)
        val wasAvailable = prefs.getBoolean("is_available", false)

        Log.d(
            "BootReceiver",
            "action=$action wasLoggedIn=$wasLoggedIn wasAvailable=$wasAvailable"
        )

        if (!wasLoggedIn) {
            WorkerLog.add(context, "BOOT", "Skip — not logged in")
            return
        }

        // 1. Schedule silent FCM token sync to backend (works even if user
        //    never opens the app after reboot).
        val event = if (isPackageReplaced) "package_replaced" else "boot"
        try {
            FcmBootSyncWorker.enqueue(context, event)
        } catch (e: Exception) {
            WorkerLog.add(context, "BOOT", "Failed to enqueue FcmBootSyncWorker: ${e.message}")
        }

        // Telemetry — periodic heartbeat must survive reboot / app upgrade.
        try {
            HeartbeatWorker.schedule(context)
            BackendSync.sendHeartbeatAsync(context, event)
            AckRetryWorker.flushOpportunistic(context, "boot:$event")
        } catch (e: Exception) {
            WorkerLog.add(context, "BOOT", "Failed to schedule HeartbeatWorker: ${e.message}")
        }

        // 2. Re-warm movement / location services if worker was online.
        if (wasAvailable && isBoot) {
            try {
                MovementTrackingService.startPassive(context, "passive:boot")
                WorkerLog.add(context, "SVC", "MovementTrackingService re-warmed")
            } catch (e: Exception) {
                WorkerLog.add(context, "SVC", "MovementTrackingService warm-up failed: ${e.message}")
            }

            try {
                val locationServiceIntent = Intent(context, LocationTrackingService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(locationServiceIntent)
                } else {
                    context.startService(locationServiceIntent)
                }
                LocationUpdateWorker.schedule(context)
                WorkerLog.add(context, "SVC", "LocationTrackingService restarted")
            } catch (e: Exception) {
                WorkerLog.add(context, "SVC", "LocationTrackingService restart failed: ${e.message}")
            }
        }
    }
}
