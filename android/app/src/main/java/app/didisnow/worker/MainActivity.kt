package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
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
    
    companion object {
        private const val TAG = "MainActivity"
        private const val WEBVIEW_READY_DELAY_MS = 4000L // Wait longer for WebView + React + Auth to be ready
    }
    
    private var bookingActionPlugin: BookingActionPlugin? = null
    private var webViewReady = false
    private val mainHandler = Handler(Looper.getMainLooper())
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        registerPlugin(ForegroundServicePlugin::class.java)
        registerPlugin(OverlayPlugin::class.java)
        registerPlugin(AuthBridge::class.java)
        registerPlugin(LocationPlugin::class.java)
        registerPlugin(SmsRetrieverPlugin::class.java)
        registerPlugin(BookingActionPlugin::class.java)
        
        Log.d(TAG, "🚀 App starting - checking permissions")
        
        // Show unified permissions dialog (battery + overlay)
        BatteryOptimizationHelper.showPermissionsDialog(this)
        
        // Handle intent if launched from overlay
        handleIntent(intent)
        
        // Schedule WebView ready check after delay
        scheduleWebViewReadyCheck()
    }
    
    override fun onStart() {
        super.onStart()
        // Also check for pending actions when app comes to foreground
        scheduleWebViewReadyCheck()
    }
    
    // IMPORTANT: must match BridgeActivity/Activity signature (non-null Intent)
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Log.d(TAG, "🟡 onNewIntent called")
        setIntent(intent) // Update the intent so handleIntent uses the new one
        handleIntent(intent)
    }
    
    /**
     * Schedule a check for pending actions after WebView is likely ready.
     * This ensures queued actions are dispatched even if the immediate dispatch fails.
     */
    private fun scheduleWebViewReadyCheck() {
        mainHandler.postDelayed({
            Log.d(TAG, "⏰ WebView ready check - dispatching any pending actions")
            webViewReady = true
            
            // Get the plugin instance and dispatch any pending actions
            try {
                val plugin = bridge?.getPlugin("BookingAction")?.instance as? BookingActionPlugin
                plugin?.dispatchPendingActionIfExists(bridge)
            } catch (e: Exception) {
                Log.e(TAG, "Error dispatching pending action", e)
            }
        }, WEBVIEW_READY_DELAY_MS)
    }
    
    /**
     * Handle intents from native services (overlay, FCM, etc.)
     * Dispatches booking actions and navigation to the web app.
     * 
     * If WebView isn't ready, queues the action for later dispatch.
     */
    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        
        val bookingAction = intent.getStringExtra("booking_action")
        val bookingId = intent.getStringExtra("booking_id")
        val navigateTo = intent.getStringExtra("navigate_to")
        
        Log.d(TAG, "🧭 handleIntent: action=$bookingAction, bookingId=$bookingId, navigateTo=$navigateTo")
        
        // Handle booking action from overlay (accept/decline/timeout)
        if (!bookingAction.isNullOrEmpty() && !bookingId.isNullOrEmpty()) {
            Log.d(TAG, "📤 Processing booking action - QUEUEING ONLY (no immediate dispatch)")
            
            // COLD START FIX: Only queue the action, do NOT dispatch immediately.
            // The scheduled WebView ready check (scheduleWebViewReadyCheck) will dispatch
            // via dispatchPendingActionIfExists() after WebView + React + Auth are ready.
            try {
                val plugin = bridge?.getPlugin("BookingAction")?.instance as? BookingActionPlugin
                plugin?.queueAction(bookingId, bookingAction)
                Log.d(TAG, "✅ Action queued via plugin")
            } catch (e: Exception) {
                Log.e(TAG, "Error queueing action via plugin", e)
                // Fall back to SharedPreferences directly
                queueActionToPrefs(bookingId, bookingAction)
                Log.d(TAG, "✅ Action queued via fallback prefs")
            }
            
            // DO NOT dispatch immediately - even if webViewReady is true.
            // On cold start, webViewReady might be true but Supabase auth is not ready.
            // Let the scheduled check handle it after sufficient delay.
            Log.d(TAG, "⏳ Action queued for dispatch via scheduleWebViewReadyCheck()")
            
            // Clear the action extras so they don't re-trigger on next onNewIntent
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
    
    /**
     * Dispatch a booking action to the web app via CustomEvent.
     * Retries multiple times with increasing delays to ensure the event is caught.
     */
    /**
     * Dispatch a booking action to the web app via CustomEvent.
     * 
     * NOTE: This is now only used as a fallback/utility. The primary dispatch path
     * is through BookingActionPlugin.dispatchPendingActionIfExists() which includes
     * wasQueued: true in the event detail.
     */
    private fun dispatchBookingAction(bookingId: String, action: String, wasQueued: Boolean = true) {
        Log.d(TAG, "🚀 Dispatching booking action to web app: $action for $bookingId (wasQueued=$wasQueued)")
        
        // Dispatch with retries to ensure the React hook catches it
        var retryCount = 0
        val maxRetries = 8 // More retries for cold start
        val delays = listOf(500L, 1000L, 1500L, 2000L, 2500L, 3000L, 4000L, 5000L)
        
        fun doDispatch() {
            bridge?.webView?.post {
                val js = """
                    (function() {
                        console.log('[Native] Dispatching booking action (attempt ${retryCount + 1}/$maxRetries): $action for $bookingId, wasQueued=$wasQueued');
                        window.dispatchEvent(new CustomEvent('native:booking-action', {
                            detail: { 
                                bookingId: '$bookingId', 
                                action: '$action',
                                wasQueued: $wasQueued
                            }
                        }));
                    })();
                """.trimIndent()
                bridge?.webView?.evaluateJavascript(js, null)
                
                // Retry after a delay if not the last attempt
                retryCount++
                if (retryCount < maxRetries) {
                    val delay = delays.getOrElse(retryCount) { 5000L }
                    mainHandler.postDelayed({ doDispatch() }, delay)
                }
            }
        }
        
        doDispatch()
    }
    
    /**
     * Fallback: queue action directly to SharedPreferences if plugin not available.
     */
    private fun queueActionToPrefs(bookingId: String, action: String) {
        try {
            val prefs = getSharedPreferences("booking_actions", Context.MODE_PRIVATE)
            val json = org.json.JSONObject().apply {
                put("bookingId", bookingId)
                put("action", action)
                put("createdAt", System.currentTimeMillis())
            }
            prefs.edit().putString("pending_action", json.toString()).apply()
            Log.d(TAG, "Action queued via fallback prefs")
        } catch (e: Exception) {
            Log.e(TAG, "Error in fallback queue", e)
        }
    }
}
