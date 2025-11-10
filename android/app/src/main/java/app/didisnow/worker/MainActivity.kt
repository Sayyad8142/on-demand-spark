package app.didisnow.worker

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        registerPlugin(OverlayPlugin::class.java)
        registerPlugin(AuthBridge::class.java)
        registerPlugin(SmsRetrieverPlugin::class.java)
        registerPlugin(PermissionPlugin::class.java)
        
        android.util.Log.d("MainActivity", "🚀 App starting - showing combined permissions dialog")
        
        // Show combined permissions dialog
        CombinedPermissionsDialog.showPermissionsDialog(this)
        
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
