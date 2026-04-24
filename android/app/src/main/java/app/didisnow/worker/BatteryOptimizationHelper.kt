package app.didisnow.worker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.appcompat.app.AlertDialog

object BatteryOptimizationHelper {
    fun showBatteryDialog(activity: Activity) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val packageName = activity.packageName
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                activity.startActivity(intent)
            }
        } catch (e: Exception) {
            android.util.Log.e("BatteryOptimizationHelper", "Failed to show battery optimization dialog", e)
        }
    }
    
    fun requestIgnoreBatteryOptimizations(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = context.packageName

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    intent.data = Uri.parse("package:$packageName")
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun showPermissionsDialog(activity: Activity) {
        val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
        val packageName = activity.packageName
        
        // Check if we need to show the dialog (battery optimization not granted)
        val needsBatteryPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && 
            !pm.isIgnoringBatteryOptimizations(packageName)
        
        // Check if we need overlay permission
        val needsOverlayPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && 
            !android.provider.Settings.canDrawOverlays(activity)

        // Only show dialog if at least one permission is needed
        if (!needsBatteryPermission && !needsOverlayPermission) {
            android.util.Log.d("Permissions", "✅ All permissions already granted")
            return
        }

        android.util.Log.d("Permissions", "📱 Showing unified permissions dialog")
        
        // Inflate custom layout with permission descriptions
        val inflater = activity.layoutInflater
        val customView = inflater.inflate(R.layout.dialog_permissions, null)
        
        AlertDialog.Builder(activity)
            .setTitle("Required Permissions")
            .setView(customView)
            .setPositiveButton("Allow") { _, _ ->
                // Request battery optimization first
                if (needsBatteryPermission) {
                    requestIgnoreBatteryOptimizations(activity)
                    
                    // Then request overlay permission with longer delay (3 seconds)
                    // to give user time to complete battery permission first
                    if (needsOverlayPermission) {
                        android.os.Handler(activity.mainLooper).postDelayed({
                            OverlayPermissionHelper.request(activity)
                        }, 3000)
                    }
                } else if (needsOverlayPermission) {
                    // Only overlay needed, request immediately
                    OverlayPermissionHelper.request(activity)
                }
            }
            .setNegativeButton("Later", null)
            .setCancelable(false)
            .show()
    }
}
