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

    fun showBatteryDialog(activity: Activity) {
        val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
        val packageName = activity.packageName

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !pm.isIgnoringBatteryOptimizations(packageName)) {
            // Inflate custom layout with permission descriptions
            val inflater = activity.layoutInflater
            val customView = inflater.inflate(R.layout.dialog_permissions, null)
            
            AlertDialog.Builder(activity)
                .setTitle("Allow Background Running")
                .setView(customView)
                .setPositiveButton("Allow") { _, _ ->
                    requestIgnoreBatteryOptimizations(activity)
                }
                .setNegativeButton("Later", null)
                .show()
        }
    }
}
