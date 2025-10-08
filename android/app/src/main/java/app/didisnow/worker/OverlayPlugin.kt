package app.didisnow.worker

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "Overlay")
class OverlayPlugin : Plugin() {

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(activity)) {
                // Request permission
                OverlayPermissionHelper.request(activity)
                call.resolve(com.getcapacitor.JSObject().put("granted", false))
            } else {
                call.resolve(com.getcapacitor.JSObject().put("granted", true))
            }
        } else {
            // Pre-M devices don't need permission
            call.resolve(com.getcapacitor.JSObject().put("granted", true))
        }
    }

    @PluginMethod
    fun checkOverlayPermission(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }

        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(activity)
        } else {
            true
        }

        call.resolve(com.getcapacitor.JSObject().put("granted", granted))
    }

    @PluginMethod
    fun showBookingOverlay(call: PluginCall) {
        val bookingJson = call.getString("booking") ?: run {
            call.reject("Missing booking data")
            return
        }

        val context = context ?: run {
            call.reject("Context not available")
            return
        }

        try {
            // Parse booking JSON to extract details
            val bookingData = org.json.JSONObject(bookingJson)
            
            val intent = Intent(context, BookingOverlayService::class.java).apply {
                putExtra("booking_id", bookingData.optString("id", ""))
                putExtra("service_type", bookingData.optString("service_type", ""))
                putExtra("customer_name", bookingData.optString("cust_name", ""))
                putExtra("community", bookingData.optString("community", ""))
                putExtra("flat_no", bookingData.optString("flat_no", ""))
                putExtra("price", bookingData.optInt("price_inr", 0))
                putExtra("booking_json", bookingJson)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            call.resolve()
        } catch (e: Exception) {
            android.util.Log.e("OverlayPlugin", "Error showing overlay", e)
            call.reject("Failed to show overlay: ${e.message}")
        }
    }

    @PluginMethod
    fun hideOverlay(call: PluginCall) {
        val context = context ?: run {
            call.reject("Context not available")
            return
        }

        val intent = Intent(context, BookingOverlayService::class.java)
        context.stopService(intent)

        call.resolve()
    }
}
