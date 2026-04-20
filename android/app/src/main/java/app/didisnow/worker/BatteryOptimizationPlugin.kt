package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BatteryOptimization")
class BatteryOptimizationPlugin : Plugin() {

    private val TAG = "BatteryOptPlugin"

    @PluginMethod
    fun isIgnoring(call: PluginCall) {
        try {
            val ignoring = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                pm.isIgnoringBatteryOptimizations(context.packageName)
            } else true
            Log.d(TAG, "🔋 [Native] isIgnoring=$ignoring")
            val ret = JSObject().put("ignoring", ignoring)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "❌ [Native] isIgnoring error", e)
            call.reject("Battery check error: ${e.message}")
        }
    }

    @PluginMethod
    fun request(call: PluginCall) {
        Log.d(TAG, "🟢 [Native] BatteryOptimizationPlugin.request entered")
        val activity = activity ?: run {
            Log.e(TAG, "❌ [Native] Activity not available — cannot launch battery settings")
            call.reject("Activity not available")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Log.d(TAG, "ℹ️ [Native] Pre-Android M — battery exemption not required")
            call.resolve(JSObject().put("requested", true))
            return
        }

        // Primary intent: opens the per-app "Allow ignore battery optimizations?" dialog.
        // Some OEMs / locked-down devices block this; fall back to the global
        // battery-optimization settings list so the user can still grant it manually.
        val pkg = activity.packageName
        var launched = false
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$pkg")
            }
            Log.d(TAG, "📣 [Native] Launching ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS for $pkg")
            activity.startActivity(intent)
            launched = true
            Log.d(TAG, "✅ [Native] ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS started")
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ [Native] Direct request intent failed, attempting fallback", e)
        }

        if (!launched) {
            try {
                val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                Log.d(TAG, "📣 [Native] Launching ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS (fallback)")
                activity.startActivity(fallback)
                launched = true
                Log.d(TAG, "✅ [Native] Fallback battery settings started")
            } catch (e2: Exception) {
                Log.e(TAG, "❌ [Native] Fallback battery settings also failed", e2)
                call.reject("Battery request error: ${e2.message}")
                return
            }
        }

        call.resolve(JSObject().put("requested", launched))
    }
}
