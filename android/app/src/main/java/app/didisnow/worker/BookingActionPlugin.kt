package app.didisnow.worker

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.JSObject
import org.json.JSONObject

/**
 * Capacitor Plugin for managing pending booking actions.
 * 
 * Allows native code to queue booking actions and web app to:
 * - Get pending actions
 * - Acknowledge (clear) processed actions
 * 
 * This ensures actions aren't lost if the web app isn't ready when
 * the overlay sends an intent.
 */
@CapacitorPlugin(name = "BookingAction")
class BookingActionPlugin : Plugin() {
    
    companion object {
        private const val TAG = "BookingActionPlugin"
        private const val PREFS_NAME = "booking_actions"
        private const val KEY_PENDING_ACTION = "pending_action"
        private const val ACTION_EXPIRY_MS = 60_000L // 60 seconds
    }
    
    private fun getPrefs(): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    /**
     * Get the current pending booking action, if any.
     * Returns null if no action or if action has expired.
     */
    @PluginMethod
    fun getPendingAction(call: PluginCall) {
        try {
            val prefs = getPrefs()
            val actionJson = prefs.getString(KEY_PENDING_ACTION, null)
            
            if (actionJson.isNullOrEmpty()) {
                Log.d(TAG, "No pending action found")
                call.resolve(JSObject())
                return
            }
            
            val json = JSONObject(actionJson)
            val createdAt = json.optLong("createdAt", 0)
            val now = System.currentTimeMillis()
            
            // Check if action has expired (older than 60 seconds)
            if (now - createdAt > ACTION_EXPIRY_MS) {
                Log.d(TAG, "Pending action expired, clearing")
                prefs.edit().remove(KEY_PENDING_ACTION).apply()
                call.resolve(JSObject())
                return
            }
            
            val result = JSObject()
            result.put("bookingId", json.optString("bookingId"))
            result.put("action", json.optString("action"))
            result.put("createdAt", createdAt)
            
            Log.d(TAG, "Returning pending action: $result")
            call.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting pending action", e)
            call.reject("Failed to get pending action: ${e.message}")
        }
    }
    
    /**
     * Clear the pending booking action.
     * Called by web app after successfully processing the action.
     */
    @PluginMethod
    fun clearPendingAction(call: PluginCall) {
        try {
            val prefs = getPrefs()
            prefs.edit().remove(KEY_PENDING_ACTION).apply()
            Log.d(TAG, "Pending action cleared")
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing pending action", e)
            call.reject("Failed to clear pending action: ${e.message}")
        }
    }
    
    /**
     * Queue a booking action. Called internally by native code.
     * Stores action in SharedPreferences with timestamp.
     */
    fun queueAction(bookingId: String, action: String) {
        try {
            val json = JSONObject().apply {
                put("bookingId", bookingId)
                put("action", action)
                put("createdAt", System.currentTimeMillis())
            }
            
            val prefs = getPrefs()
            prefs.edit().putString(KEY_PENDING_ACTION, json.toString()).apply()
            
            Log.d(TAG, "Action queued: bookingId=$bookingId, action=$action")
        } catch (e: Exception) {
            Log.e(TAG, "Error queueing action", e)
        }
    }
    
    /**
     * Check if there's a pending action and dispatch it via JS event.
     * Called from MainActivity when WebView becomes ready.
     */
    fun dispatchPendingActionIfExists(bridge: com.getcapacitor.Bridge?) {
        try {
            val prefs = getPrefs()
            val actionJson = prefs.getString(KEY_PENDING_ACTION, null)
            
            if (actionJson.isNullOrEmpty()) {
                Log.d(TAG, "No pending action to dispatch")
                return
            }
            
            val json = JSONObject(actionJson)
            val createdAt = json.optLong("createdAt", 0)
            val now = System.currentTimeMillis()
            
            // Check if action has expired
            if (now - createdAt > ACTION_EXPIRY_MS) {
                Log.d(TAG, "Pending action expired, not dispatching")
                prefs.edit().remove(KEY_PENDING_ACTION).apply()
                return
            }
            
            val bookingId = json.optString("bookingId")
            val action = json.optString("action")
            
            if (bookingId.isEmpty() || action.isEmpty()) {
                Log.w(TAG, "Invalid pending action data")
                return
            }
            
            Log.d(TAG, "🚀 Dispatching pending action: bookingId=$bookingId, action=$action")
            
            bridge?.webView?.post {
                val js = """
                    (function() {
                        console.log('[Native] Dispatching QUEUED booking action: $action for $bookingId');
                        window.dispatchEvent(new CustomEvent('native:booking-action', {
                            detail: { 
                                bookingId: '$bookingId', 
                                action: '$action',
                                wasQueued: true
                            }
                        }));
                    })();
                """.trimIndent()
                bridge.webView?.evaluateJavascript(js, null)
            }
            
            // Note: We don't clear the action here - the web app will call clearPendingAction
            // after successfully processing it
            
        } catch (e: Exception) {
            Log.e(TAG, "Error dispatching pending action", e)
        }
    }
}
