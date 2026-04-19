package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BatteryOptimization")
class BatteryOptimizationPlugin : Plugin() {

    @PluginMethod
    fun isIgnoring(call: PluginCall) {
        try {
            val ignoring = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                pm.isIgnoringBatteryOptimizations(context.packageName)
            } else true
            val ret = JSObject().put("ignoring", ignoring)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Battery check error: ${e.message}")
        }
    }

    @PluginMethod
    fun request(call: PluginCall) {
        try {
            val activity = activity ?: run {
                call.reject("Activity not available")
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivity(intent)
            }
            val ret = JSObject().put("requested", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Battery request error: ${e.message}")
        }
    }
}
