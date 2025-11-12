package app.didisnow.worker

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "PermissionPlugin")
class PermissionPlugin : Plugin() {
    
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        activity?.let { activity ->
            activity.runOnUiThread {
                PermissionHelper.requestNotificationPermissionWithRationale(activity)
            }
            call.resolve()
        } ?: call.reject("Activity not available")
    }
}
