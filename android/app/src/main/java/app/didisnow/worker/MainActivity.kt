package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity
import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ForegroundService")
class ForegroundServicePlugin : Plugin() {
    @com.getcapacitor.PluginMethod
    fun start(call: com.getcapacitor.PluginCall) {
        val intent = Intent(context, BookingForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        
        // Save login state to persist across reboots
        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_logged_in", true).apply()
        
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun stop(call: com.getcapacitor.PluginCall) {
        val intent = Intent(context, BookingForegroundService::class.java)
        context.stopService(intent)
        
        // Clear login state
        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_logged_in", false).apply()
        
        call.resolve()
    }
}

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        registerPlugin(ForegroundServicePlugin::class.java)
        registerPlugin(OverlayPlugin::class.java)
        registerPlugin(AuthBridge::class.java)
        registerPlugin(LocationPlugin::class.java)
        registerPlugin(SmsRetrieverPlugin::class.java)
        
        android.util.Log.d("MainActivity", "🚀 App starting - checking permissions")
        
        // Request battery optimization exemption to keep foreground service running
        BatteryOptimizationHelper.showBatteryDialog(this)
        
        // Handle intent if launched from overlay
        handleNavigationIntent(intent)
    }
    
    // IMPORTANT: must match BridgeActivity/Activity signature (non-null Intent)
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        android.util.Log.d("MainActivity", "🟡 onNewIntent called")
        handleNavigationIntent(intent)
    }
    
    // Accept nullable Intent and guard reads
    private fun handleNavigationIntent(intent: Intent?) {
        val navigateTo = intent?.getStringExtra("navigate_to")
        val bookingId = intent?.getStringExtra("booking_id")
        
        android.util.Log.d("MainActivity", "🧭 Navigation intent: navigateTo=$navigateTo, bookingId=$bookingId")
        
        if (navigateTo.isNullOrEmpty()) return
        
        // Send event to WebView/JS
        bridge?.webView?.post {
            val js = """
                window.dispatchEvent(new CustomEvent('native:navigate', {
                  detail: { screen: '$navigateTo', bookingId: '${bookingId ?: ""}' }
                }));
            """.trimIndent()
            bridge?.webView?.evaluateJavascript(js, null)
        }
    }
}
