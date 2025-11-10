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
            val dialog = AlertDialog.Builder(activity)
                .setTitle("Disable Battery Optimization")
                .setMessage(
                    "🔋 Allow background operation\n\n" +
                    "🔔 Receive bookings 24/7\n\n" +
                    "✅ Stay connected to customers\n\n" +
                    "To keep receiving booking notifications, please allow Didi Now Partner to run in the background without battery restrictions. This ensures you never miss a job opportunity."
                )
                .setPositiveButton("Allow") { _, _ ->
                    requestIgnoreBatteryOptimizations(activity)
                }
                .setNegativeButton("Later", null)
                .setCancelable(false)
                .create()
            
            dialog.show()
            
            // Force text colors to be visible
            dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.setTextColor(0xFF4CAF50.toInt())
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor(0xFF757575.toInt())
        }
    }
}
