package app.didisnow.worker

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Listing only: never starts an in-app update or claims installation succeeded. */
@CapacitorPlugin(name = "WorkerStore")
class WorkerStorePlugin : Plugin() {
    @PluginMethod
    fun open(call: PluginCall) {
        activity.runOnUiThread {
            try {
                val play = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=app.didisnow.worker"))
                    .setPackage("com.android.vending")
                activity.startActivity(play)
                call.resolve(JSObject().put("destination", "play"))
            } catch (_: ActivityNotFoundException) {
                try {
                    activity.startActivity(Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://play.google.com/store/apps/details?id=app.didisnow.worker")))
                    call.resolve(JSObject().put("destination", "browser"))
                } catch (_: Exception) {
                    call.reject("Unable to open the Worker App listing")
                }
            } catch (_: Exception) {
                call.reject("Unable to open Google Play")
            }
        }
    }
}