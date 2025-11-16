package app.didisnow.worker

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object NotificationPermissionHelper {
    private const val NOTIFICATION_PERMISSION_CODE = 9912
    
    fun hasPermission(activity: Activity): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Not required for Android 12 and below
        }
    }
    
    fun request(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_CODE
            )
        }
    }
    
    fun showNotificationPermissionDialog(activity: Activity) {
        if (hasPermission(activity)) {
            android.util.Log.d("NotificationPermission", "✅ Notification permission already granted")
            return
        }
        
        android.util.Log.d("NotificationPermission", "🔔 Showing notification permission dialog")
        
        AlertDialog.Builder(activity)
            .setTitle("🔔 Enable Notifications")
            .setMessage(
                "📱 Why we need this permission:\n\n" +
                "• Receive instant alerts for new booking requests\n" +
                "• Get notified about booking updates and changes\n" +
                "• Stay informed about job status changes\n\n" +
                "✅ Notifications help you respond quickly to customers and never miss a job opportunity.\n\n" +
                "This is essential for receiving booking alerts."
            )
            .setPositiveButton("Allow") { _, _ ->
                android.util.Log.d("NotificationPermission", "🔓 User clicked Allow - requesting permission")
                request(activity)
            }
            .setNegativeButton("Later") { _, _ ->
                android.util.Log.d("NotificationPermission", "⏭️ User clicked Later")
            }
            .setCancelable(false)
            .show()
    }
}
