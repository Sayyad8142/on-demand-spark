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
            Log.d(TAG, "🔋 isIgnoring=$ignoring")
            call.resolve(JSObject().put("ignoring", ignoring))
        } catch (e: Exception) {
            Log.e(TAG, "❌ isIgnoring error", e)
            call.reject("Battery check error: ${e.message}")
        }
    }

    /**
     * Launch the battery-optimization request dialog with multiple fallbacks.
     * Many OEMs (especially Xiaomi/Vivo) block the per-package request intent,
     * so we cascade through:
     *
     *   1. ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS  (per-package dialog)
     *   2. ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS  (global list)
     *   3. ACTION_APPLICATION_DETAILS_SETTINGS          (last resort)
     */
    private fun launchBatterySettings(): Boolean {
        val ctx: Context = activity ?: context
        val pkg = ctx.packageName
        val device = "${Build.MANUFACTURER} / ${Build.MODEL} / API ${Build.VERSION.SDK_INT}"
        Log.d(TAG, "📣 Launching battery settings (device: $device, pkg=$pkg)")

        // 1. Direct per-package request dialog
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$pkg")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            Log.d(TAG, "✅ ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS started")
            return true
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Direct battery request failed: ${e.message}")
        }

        // 2. Fallback: global battery-optimization list
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            Log.d(TAG, "✅ ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS started (fallback)")
            return true
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Global battery list failed: ${e.message}")
        }

        // 3. Last-resort: app details settings
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$pkg")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            Log.d(TAG, "✅ ACTION_APPLICATION_DETAILS_SETTINGS started (last resort)")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "❌ All battery setting intents failed", e)
        }

        return false
    }

    @PluginMethod
    fun request(call: PluginCall) {
        Log.d(TAG, "🟢 BatteryOptimizationPlugin.request entered")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Log.d(TAG, "ℹ️ Pre-Android M — battery exemption not required")
            call.resolve(JSObject().put("requested", true))
            return
        }
        val opened = launchBatterySettings()
        if (opened) {
            call.resolve(JSObject().put("requested", true))
        } else {
            call.reject("Could not open battery settings on this device")
        }
    }
}
