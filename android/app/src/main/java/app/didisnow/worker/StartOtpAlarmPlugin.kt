package app.didisnow.worker
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "StartOtpAlarm")
class StartOtpAlarmPlugin : Plugin() {
    @PluginMethod fun configure(call: PluginCall) {
        StartOtpAlarmEngine.configure(context, call.getString("userId") ?: "", call.getLong("generation") ?: 0)
        StartOtpAlarmEngine.setConfig(context, call.getString("url") ?: "", call.getString("key") ?: "")
        call.resolve()
    }
    @PluginMethod fun sync(call: PluginCall) { StartOtpAlarmEngine.sync(context, call.getString("userId") ?: "", call.getLong("generation") ?: 0); call.resolve() }
    @PluginMethod fun stopAll(call: PluginCall) { StartOtpAlarmEngine.stopAll(context); call.resolve() }
    @PluginMethod fun cancel(call: PluginCall) { StartOtpAlarmEngine.cancel(context, call.getString("bookingId") ?: ""); call.resolve() }
    @PluginMethod fun reconcile(call: PluginCall) { StartOtpAlarmEngine.reconcile(context, true); call.resolve() }
}
