package app.didisnow.worker

import android.content.Context
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
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
    private val inAppUpdateManager by lazy { InAppUpdateManager(this) }

    private val cancellationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val bookingId = intent?.getStringExtra("booking_id") ?: ""
            dispatchCancellationAlertToWebView(bookingId)
        }
    }

    private val reassignedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val bookingId = intent?.getStringExtra("booking_id") ?: ""
            dispatchReassignedAlertToWebView(bookingId)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // OTA: Check boot health and restore/rollback BEFORE Capacitor loads the WebView
        handleOtaBootHealth()

        // Register custom Capacitor plugins BEFORE super.onCreate().
        // BridgeActivity loads the WebView/bridge inside super.onCreate(), so
        // registering after super makes JS see custom plugins as "not implemented".
        registerPlugin(ForegroundServicePlugin::class.java)
        registerPlugin(OverlayPlugin::class.java)
        registerPlugin(AuthBridge::class.java)
        registerPlugin(LocationPlugin::class.java)
        registerPlugin(SmsRetrieverPlugin::class.java)
        registerPlugin(LiveUpdatePlugin::class.java) // registered as "DidiLiveUpdate" via annotation
        registerPlugin(StepCounterPlugin::class.java)
        registerPlugin(BatteryOptimizationPlugin::class.java)
        registerPlugin(CancellationVoicePlugin::class.java)
        
        super.onCreate(savedInstanceState)
        
        android.util.Log.d("MainActivity", "🚀 App starting — permissions handled by JS PermissionOnboarding screen")
        
        // NOTE: native AlertDialog removed. The web-side PermissionOnboarding
        // screen now drives the entire permission UX (notifications, overlay,
        // battery optimization, activity recognition) so workers see one
        // unified flow instead of multiple surprise system popups.
        
        // Handle intent if launched from overlay
        handleNavigationIntent(intent)
        deliverPendingCancellationAlert()
        deliverPendingReassignedAlert()

        // Google Play In-App Updates — Immediate flow (primary force update)
        // Supabase app_config force update screen remains as fallback.
        inAppUpdateManager.checkForUpdate()

        // Telemetry — schedule periodic native heartbeat + fire one immediately
        // so the backend sees this device is reachable even before JS layer boots.
        try {
            HeartbeatWorker.schedule(this)
            BackendSync.sendHeartbeatAsync(this, "open")
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "Heartbeat schedule failed: ${e.message}")
        }
    }

    override fun onResume() {
        super.onResume()
        LocalBroadcastManager.getInstance(this).registerReceiver(
            cancellationReceiver,
            IntentFilter("BOOKING_CANCELLED_ALERT")
        )
        LocalBroadcastManager.getInstance(this).registerReceiver(
            reassignedReceiver,
            IntentFilter("BOOKING_REASSIGNED_ALERT")
        )
        deliverPendingCancellationAlert()
        deliverPendingReassignedAlert()
        inAppUpdateManager.resumeUpdateIfPending()
    }

    @Deprecated("Capacitor still routes legacy startActivityForResult here")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        inAppUpdateManager.handleActivityResult(requestCode, resultCode, data)
    }

    override fun onPause() {
        LocalBroadcastManager.getInstance(this).unregisterReceiver(cancellationReceiver)
        LocalBroadcastManager.getInstance(this).unregisterReceiver(reassignedReceiver)
        super.onPause()
    }
    
    // IMPORTANT: must match BridgeActivity/Activity signature (non-null Intent)
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        android.util.Log.d("MainActivity", "🟡 onNewIntent called")
        handleNavigationIntent(intent)
    }
    
    // Accept nullable Intent and guard reads
    private fun handleNavigationIntent(intent: Intent?) {
        val bookingId = intent?.getStringExtra("booking_id") ?: intent?.getStringExtra("bookingId")
        val navigateTo = intent?.getStringExtra("navigate_to")
            ?: intent?.getStringExtra("screen")
            ?: if (!bookingId.isNullOrEmpty()) "bookings" else null
        
        android.util.Log.d("MainActivity", "🧭 Navigation intent: navigateTo=$navigateTo, bookingId=$bookingId")
        
        if (navigateTo.isNullOrEmpty()) return

        if (intent?.getStringExtra("alert_type") == "BOOKING_CANCELLED") {
            dispatchCancellationAlertToWebView(bookingId ?: "")
        }
        
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

    private fun dispatchCancellationAlertToWebView(bookingId: String) {
        bridge?.webView?.post {
            val js = """
                window.dispatchEvent(new CustomEvent('bookingCancelledAlert', {
                  detail: { bookingId: '$bookingId', source: 'native' }
                }));
            """.trimIndent()
            bridge?.webView?.evaluateJavascript(js, null)
        }
    }

    private fun deliverPendingCancellationAlert() {
        val prefs = getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val bookingId = prefs.getString("pending_cancelled_booking_id", null) ?: return
        val createdAt = prefs.getLong("pending_cancelled_booking_at", 0L)
        if (bookingId.isBlank() || createdAt <= 0L || System.currentTimeMillis() - createdAt > 120000L) {
            prefs.edit().remove("pending_cancelled_booking_id").remove("pending_cancelled_booking_at").apply()
            return
        }
        dispatchCancellationAlertToWebView(bookingId)
        prefs.edit().remove("pending_cancelled_booking_id").remove("pending_cancelled_booking_at").apply()
    }

    private fun dispatchReassignedAlertToWebView(bookingId: String) {
        bridge?.webView?.post {
            val js = """
                window.postMessage({ type: 'BOOKING_REASSIGNED', bookingId: '$bookingId' }, '*');
            """.trimIndent()
            bridge?.webView?.evaluateJavascript(js, null)
        }
    }

    private fun deliverPendingReassignedAlert() {
        val prefs = getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val bookingId = prefs.getString("pending_reassigned_booking_id", null) ?: return
        val createdAt = prefs.getLong("pending_reassigned_booking_at", 0L)
        if (bookingId.isBlank() || createdAt <= 0L || System.currentTimeMillis() - createdAt > 300000L) {
            prefs.edit().remove("pending_reassigned_booking_id").remove("pending_reassigned_booking_at").apply()
            return
        }
        dispatchReassignedAlertToWebView(bookingId)
        prefs.edit().remove("pending_reassigned_booking_id").remove("pending_reassigned_booking_at").apply()
    }
    
    /**
     * OTA Boot Health Check — runs BEFORE super.onCreate() / WebView load.
     * 
     * Logic:
     * 1. If there is a pending_version and boot was NOT confirmed last run → rollback.
     *    This means the previous OTA bundle crashed before React could call confirmBoot().
     * 2. If there is a confirmed active path with valid index.html → restore it via
     *    CapWebViewSettings so Capacitor loads from the OTA bundle.
     * 3. Otherwise → use built-in APK bundle (default).
     */
    private fun handleOtaBootHealth() {
        try {
            val prefs = getSharedPreferences("didi_live_update_prefs", Context.MODE_PRIVATE)
            val pendingVersion = prefs.getString("pending_bundle_version", null)
            val bootConfirmed = prefs.getBoolean("boot_confirmed", true) // default true = no pending
            val activePath = prefs.getString("active_bundle_path", null)
            val activeVersion = prefs.getString("active_bundle_version", null)
            
            android.util.Log.d("MainActivity", "📦 OTA boot check: pending=$pendingVersion confirmed=$bootConfirmed active=$activeVersion path=$activePath")
            
            // Case 1: Pending version exists but boot was NOT confirmed → ROLLBACK
            if (!pendingVersion.isNullOrEmpty() && !bootConfirmed) {
                android.util.Log.w("MainActivity", "📦 OTA: Boot NOT confirmed for $pendingVersion — ROLLING BACK")
                
                // Clear OTA state
                prefs.edit().clear().apply()
                
                // Delete all downloaded bundles
                val bundlesRoot = java.io.File(filesDir, "ota_bundles")
                if (bundlesRoot.exists()) {
                    bundlesRoot.deleteRecursively()
                }
                
                // Clear CapWebViewSettings so Capacitor loads from built-in
                val capPrefs = getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE)
                capPrefs.edit().remove("serverBasePath").apply()
                
                // Store the failed version in Capacitor Preferences so JS side skips it
                // (Capacitor Preferences are stored in a different SharedPreferences file)
                android.util.Log.w("MainActivity", "📦 OTA: Rolled back to built-in bundle")
                return
            }
            
            // Case 2: Active path exists and is valid → restore it
            if (!activePath.isNullOrEmpty()) {
                val bundleDir = java.io.File(activePath)
                val indexFile = java.io.File(bundleDir, "index.html")
                
                if (bundleDir.exists() && indexFile.exists()) {
                    val capPrefs = getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE)
                    capPrefs.edit().putString("serverBasePath", activePath).apply()
                    android.util.Log.d("MainActivity", "📦 OTA: Restored bundle path: $activePath")
                } else {
                    // Bundle corrupted/missing → clear and use built-in
                    prefs.edit().clear().apply()
                    val capPrefs = getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE)
                    capPrefs.edit().remove("serverBasePath").apply()
                    android.util.Log.w("MainActivity", "📦 OTA: Bundle path invalid, cleared → using built-in")
                }
            }
            // Case 3: No OTA bundle active → Capacitor defaults to built-in (no action needed)
            
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "📦 OTA: Error in boot health check", e)
        }
    }
}
