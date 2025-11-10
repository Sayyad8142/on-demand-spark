package app.didisnow.worker

import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object PermissionHelper {
    
    const val NOTIFICATION_PERMISSION_CODE = 2001
    
    /**
     * Show rationale dialog before requesting notification permission
     */
    fun requestNotificationPermissionWithRationale(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permission = android.Manifest.permission.POST_NOTIFICATIONS
            
            if (ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED) {
                android.util.Log.d("PermissionHelper", "✅ Notification permission already granted")
                return
            }
            
            if (ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)) {
                // User previously denied, show rationale
                showRationaleDialog(
                    activity,
                    "Enable Notifications",
                    "🔔 Allow notifications to receive instant booking alerts from customers.\n\nYou'll be notified immediately when customers request your services.",
                    permission,
                    NOTIFICATION_PERMISSION_CODE
                )
            } else {
                // First time, request directly
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(permission),
                    NOTIFICATION_PERMISSION_CODE
                )
            }
        }
    }
    
    /**
     * Show a rationale dialog explaining why permission is needed
     */
    private fun showRationaleDialog(
        activity: Activity,
        title: String,
        message: String,
        permission: String,
        requestCode: Int
    ) {
        androidx.appcompat.app.AlertDialog.Builder(activity)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("Allow") { _, _ ->
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(permission),
                    requestCode
                )
            }
            .setNegativeButton("Not Now") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(false)
            .create()
            .apply {
                show()
            }
    }
    
    /**
     * Show a rationale dialog explaining why permissions are needed (multiple permissions)
     */
    private fun showRationaleDialog(
        activity: Activity,
        title: String,
        message: String,
        permissions: Array<String>,
        requestCode: Int
    ) {
        androidx.appcompat.app.AlertDialog.Builder(activity)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("Allow") { _, _ ->
                ActivityCompat.requestPermissions(
                    activity,
                    permissions,
                    requestCode
                )
            }
            .setNegativeButton("Not Now") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(false)
            .create()
            .apply {
                show()
            }
    }
}
