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

        val dialog = AlertDialog.Builder(activity)
            .setTitle("Display Over Other Apps")
            .setMessage(
                "📱 Display over locked screen and other apps\n\n" +
                "🔔 Show urgent booking alerts instantly\n\n" +
                "✅ Never miss booking opportunities\n\n" +
                "This permission allows booking alerts to appear on top of YouTube, WhatsApp, and other apps even when your screen is locked, so you can accept jobs immediately."
            )
            .setPositiveButton("Allow") { _, _ ->
                android.util.Log.d("OverlayPermission", "🔓 User clicked Allow - requesting permission")
                request(activity)
            }
            .setNegativeButton("Later") { _, _ ->
                android.util.Log.d("OverlayPermission", "⏭️ User clicked Later")
            }
            .setCancelable(false)
            .create()
        
        dialog.show()
        
        // Force text colors to be visible
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.setTextColor(0xFF4CAF50.toInt())
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor(0xFF757575.toInt())
    }
}
