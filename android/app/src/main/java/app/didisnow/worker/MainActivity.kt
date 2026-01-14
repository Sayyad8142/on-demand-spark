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
        super.onCreate(savedInstanceState)
        registerPlugin(ForegroundServicePlugin::class.java)
        registerPlugin(OverlayPlugin::class.java)
        registerPlugin(AuthBridge::class.java)
        registerPlugin(LocationPlugin::class.java)
        registerPlugin(SmsRetrieverPlugin::class.java)
        
        android.util.Log.d("MainActivity", "🚀 App starting - checking permissions")
        
        // Show unified permissions dialog (battery + overlay)
        BatteryOptimizationHelper.showPermissionsDialog(this)
        
        // Handle intent if launched from overlay
        handleIntent(intent)
    }
    
    // IMPORTANT: must match BridgeActivity/Activity signature (non-null Intent)
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        android.util.Log.d("MainActivity", "🟡 onNewIntent called")
        setIntent(intent) // Update the intent so handleIntent uses the new one
        handleIntent(intent)
    }
    
    /**
     * Handle intents from native services (overlay, FCM, etc.)
     * Dispatches booking actions and navigation to the web app
     */
    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        
        val bookingAction = intent.getStringExtra("booking_action")
        val bookingId = intent.getStringExtra("booking_id")
        val navigateTo = intent.getStringExtra("navigate_to")
        
        android.util.Log.d("MainActivity", "🧭 handleIntent: action=$bookingAction, bookingId=$bookingId, navigateTo=$navigateTo")
        
        // Handle booking action from overlay (accept/decline/timeout)
        if (!bookingAction.isNullOrEmpty() && !bookingId.isNullOrEmpty()) {
            android.util.Log.d("MainActivity", "📤 Dispatching booking action to web app")
            
            // Wait for bridge to be ready, then dispatch event
            bridge?.webView?.post {
                val js = """
                    (function() {
                        console.log('[Native] Dispatching booking action: $bookingAction for $bookingId');
                        window.dispatchEvent(new CustomEvent('native:booking-action', {
                            detail: { 
                                bookingId: '$bookingId', 
                                action: '$bookingAction'
                            }
                        }));
                    })();
                """.trimIndent()
                bridge?.webView?.evaluateJavascript(js, null)
            }
            
            // Clear the action extras so they don't re-trigger
            intent.removeExtra("booking_action")
            intent.removeExtra("booking_id")
        }
        
        // Handle navigation (from any source)
        if (!navigateTo.isNullOrEmpty()) {
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
}
