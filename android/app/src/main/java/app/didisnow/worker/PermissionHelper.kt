package app.didisnow.worker

import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object PermissionHelper {
    
    const val NOTIFICATION_PERMISSION_CODE = 2001
    const val LOCATION_PERMISSION_CODE = 2002
    
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
     * Show rationale dialog before requesting location permission
     */
    fun requestLocationPermissionWithRationale(activity: Activity) {
        val permissions = mutableListOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        // Add background location for Android 10+ (API 29+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            permissions.add(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
        
        val needsPermission = permissions.any {
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (!needsPermission) {
            android.util.Log.d("PermissionHelper", "✅ Location permission already granted")
            return
        }
        
        if (ActivityCompat.shouldShowRequestPermissionRationale(
                activity, 
                android.Manifest.permission.ACCESS_FINE_LOCATION
            )) {
            // User previously denied, show rationale
            showRationaleDialog(
                activity,
                "Enable Location",
                "📍 Allow location access to:\n\n• Update your real-time position for customers\n• Navigate to job locations\n• Show accurate arrival times\n\nYour location is only shared when you accept a booking.",
                permissions.toTypedArray(),
                LOCATION_PERMISSION_CODE
            )
        } else {
            // First time, request directly
            ActivityCompat.requestPermissions(
                activity,
                permissions.toTypedArray(),
                LOCATION_PERMISSION_CODE
            )
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
        AlertDialog.Builder(activity)
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
            .show()
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
        AlertDialog.Builder(activity)
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
            .show()
    }
}
