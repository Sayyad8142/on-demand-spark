package app.lovable.ondemandspark

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.appcompat.app.AlertDialog

object OverlayPermissionHelper {
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true // Permission not required for older versions
        }
    }

    fun requestOverlayPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${activity.packageName}")
            )
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            activity.startActivity(intent)
        }
    }

    fun showOverlayPermissionDialog(activity: Activity) {
        if (canDrawOverlays(activity)) {
            return // Already has permission
        }

        AlertDialog.Builder(activity)
            .setTitle("Display Over Other Apps")
            .setMessage("To ensure you never miss a booking, please allow On-Demand Spark to display alerts over other apps (including YouTube, WhatsApp, etc.).\n\nThis is required for urgent booking notifications.")
            .setPositiveButton("Allow") { _, _ ->
                requestOverlayPermission(activity)
            }
            .setNegativeButton("Later", null)
            .setCancelable(false)
            .show()
    }
}
