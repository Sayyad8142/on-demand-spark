package app.didisnow.worker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.appcompat.app.AlertDialog

object OverlayPermissionHelper {
    fun canDraw(activity: Activity): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(activity)
        else true

    private fun openIntent(activity: Activity, intent: Intent, label: String): Boolean {
        return try {
            if (intent.resolveActivity(activity.packageManager) == null) {
                android.util.Log.w("OverlayPermission", "⚠️ No activity can handle $label")
                false
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(intent)
                android.util.Log.d("OverlayPermission", "✅ Opened $label on ${Build.MANUFACTURER}")
                true
            }
        } catch (e: Exception) {
            android.util.Log.w("OverlayPermission", "⚠️ Failed to open $label", e)
            false
        }
    }

    fun request(activity: Activity, requestCode: Int = 9911) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !Settings.canDrawOverlays(activity)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${activity.packageName}")
            )
            if (openIntent(activity, intent, "ACTION_MANAGE_OVERLAY_PERMISSION(package)")) return

            val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            openIntent(activity, fallbackIntent, "ACTION_APPLICATION_DETAILS_SETTINGS")
        }
    }

    fun showOverlayPermissionDialog(activity: Activity) {
        if (canDraw(activity)) {
            android.util.Log.d("OverlayPermission", "✅ Overlay permission already granted")
            return // Already has permission
        }

        android.util.Log.d("OverlayPermission", "📱 Showing overlay permission dialog")

        AlertDialog.Builder(activity)
            .setTitle("📱 Display Over Other Apps Permission")
            .setMessage(
                "🔔 Why we need this permission:\n\n" +
                "• Show urgent booking alerts even when your phone is locked\n" +
                "• Display alerts over YouTube, WhatsApp, and other apps\n" +
                "• Ensure you never miss a booking opportunity\n\n" +
                "✅ This permission allows booking alerts to appear on top of other apps so you can accept jobs immediately.\n\n" +
                "This is required for automatic booking notifications."
            )
            .setPositiveButton("Allow") { _, _ ->
                android.util.Log.d("OverlayPermission", "🔓 User clicked Allow - requesting permission")
                request(activity)
            }
            .setNegativeButton("Later") { _, _ ->
                android.util.Log.d("OverlayPermission", "⏭️ User clicked Later")
            }
            .setCancelable(false)
            .show()
    }
}
