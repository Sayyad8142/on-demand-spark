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

    fun request(activity: Activity, requestCode: Int = 9911) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !Settings.canDrawOverlays(activity)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${activity.packageName}")
            )
            activity.startActivityForResult(intent, requestCode)
        }
    }

    fun showOverlayPermissionDialog(activity: Activity) {
        if (canDraw(activity)) {
            android.util.Log.d("OverlayPermission", "✅ Overlay permission already granted")
            return // Already has permission
        }

        android.util.Log.d("OverlayPermission", "📱 Showing overlay permission dialog")

        AlertDialog.Builder(activity)
            .setTitle("Allow permissions for booking alerts")
            .setMessage(
                "We use these permissions to send you booking alerts and keep you online for new work.\n\n" +
                "📱 Display over other apps\n" +
                "Needed to show full-screen booking alerts even when you are using other apps, so you never miss a booking.\n\n" +
                "🔔 Notifications\n" +
                "Needed to send you new booking alerts, schedule reminders and payment updates.\n\n" +
                "✅ Allow background running\n" +
                "Keeps you available for bookings even when the screen is off and prevents battery saver from stopping the app."
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
