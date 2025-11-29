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
        
        // Force FCM token sync on every app launch
        android.util.Log.d("MainActivity", "🔄 Forcing FCM token sync...")
        com.google.firebase.messaging.FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                android.util.Log.e("MainActivity", "❌ Failed to get FCM token", task.exception)
                return@addOnCompleteListener
            }
            
            val token = task.result
            android.util.Log.d("MainActivity", "🔑 FCM token: ${token?.substring(0, Math.min(30, token?.length ?: 0))}...")
            
            // Token will be automatically saved by MyFirebaseService.onNewToken
            // or we can save it here directly
            if (token != null && token.isNotEmpty()) {
                saveFCMTokenToSupabase(token)
            }
        }
        
        // Handle intent if launched from overlay
        handleNavigationIntent(intent)
    }
    
    private fun saveFCMTokenToSupabase(token: String) {
        Thread {
            try {
                val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                val sessionJson = prefs.getString("didi-worker-session", null)
                
                if (sessionJson == null || sessionJson.isEmpty()) {
                    android.util.Log.w("MainActivity", "⚠️ No session found, saving token as pending")
                    prefs.edit().putString("pending_fcm_token", token).apply()
                    return@Thread
                }
                
                val session = org.json.JSONObject(sessionJson)
                val accessToken = session.optString("access_token", "")
                val userId = session.optJSONObject("user")?.optString("id", "") ?: ""
                
                if (userId.isEmpty() || accessToken.isEmpty()) {
                    android.util.Log.w("MainActivity", "⚠️ No user_id or access_token, saving as pending")
                    prefs.edit().putString("pending_fcm_token", token).apply()
                    return@Thread
                }
                
                android.util.Log.d("MainActivity", "📤 Saving FCM token for user: $userId")
                
                // Save to fcm_tokens table
                var url = java.net.URL("https://paywwbuqycovjopryele.supabase.co/rest/v1/fcm_tokens")
                var conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o")
                conn.setRequestProperty("Authorization", "Bearer $accessToken")
                conn.setRequestProperty("Prefer", "resolution=merge-duplicates")
                conn.doOutput = true
                
                val payload = org.json.JSONObject().apply {
                    put("user_id", userId)
                    put("token", token)
                }
                
                conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                
                if (conn.responseCode in 200..299) {
                    android.util.Log.d("MainActivity", "✅ Token saved to fcm_tokens")
                    
                    // Update workers table
                    url = java.net.URL("https://paywwbuqycovjopryele.supabase.co/rest/v1/workers?user_id=eq.$userId")
                    conn = url.openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "PATCH"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o")
                    conn.setRequestProperty("Authorization", "Bearer $accessToken")
                    conn.doOutput = true
                    
                    val workerPayload = org.json.JSONObject().apply {
                        put("fcm_token", token)
                    }
                    
                    conn.outputStream.use { it.write(workerPayload.toString().toByteArray(Charsets.UTF_8)) }
                    
                    if (conn.responseCode in 200..299) {
                        android.util.Log.d("MainActivity", "✅ Token saved to workers table")
                        // Clear pending token
                        prefs.edit().remove("pending_fcm_token").apply()
                    } else {
                        android.util.Log.e("MainActivity", "❌ Workers update failed: ${conn.responseCode}")
                    }
                } else {
                    android.util.Log.e("MainActivity", "❌ fcm_tokens save failed: ${conn.responseCode}")
                }
                
                conn.disconnect()
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "❌ Error saving FCM token", e)
            }
        }.start()
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
