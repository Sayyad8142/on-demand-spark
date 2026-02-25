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
        // Foreground service removed - FCM handles notifications
        // Save login state to persist across reboots
        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_logged_in", true).apply()
        
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun stop(call: com.getcapacitor.PluginCall) {
        // Foreground service removed - FCM handles notifications
        // Clear login state
        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_logged_in", false).apply()
        
        call.resolve()
    }
}

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Restore OTA bundle path BEFORE super.onCreate so Capacitor loads from it
        restoreOtaBundlePath()
        
        super.onCreate(savedInstanceState)
        registerPlugin(ForegroundServicePlugin::class.java)
        registerPlugin(OverlayPlugin::class.java)
        registerPlugin(AuthBridge::class.java)
        registerPlugin(LocationPlugin::class.java)
        registerPlugin(SmsRetrieverPlugin::class.java)
        registerPlugin(LiveUpdatePlugin::class.java)
        
        android.util.Log.d("MainActivity", "🚀 App starting - checking permissions")
        
        // Show unified permissions dialog (battery + overlay)
        BatteryOptimizationHelper.showPermissionsDialog(this)
        
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
    
    /**
     * Restore OTA bundle path from SharedPreferences before Capacitor initializes.
     * This ensures the WebView loads from the downloaded bundle instead of the APK assets.
     */
    private fun restoreOtaBundlePath() {
        try {
            val prefs = getSharedPreferences("live_update_prefs", Context.MODE_PRIVATE)
            val activePath = prefs.getString("active_bundle_path", null)
            
            if (!activePath.isNullOrEmpty()) {
                val bundleDir = java.io.File(activePath)
                val indexFile = java.io.File(bundleDir, "index.html")
                
                if (bundleDir.exists() && indexFile.exists()) {
                    // Set the Capacitor server path to the OTA bundle
                    val configPrefs = getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE)
                    configPrefs.edit().putString("serverBasePath", activePath).apply()
                    android.util.Log.d("MainActivity", "📦 OTA: Restored bundle path: $activePath")
                } else {
                    // Bundle is corrupted/missing, clear it
                    prefs.edit().clear().apply()
                    android.util.Log.w("MainActivity", "📦 OTA: Bundle path invalid, cleared")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "📦 OTA: Error restoring bundle path", e)
        }
    }
}
