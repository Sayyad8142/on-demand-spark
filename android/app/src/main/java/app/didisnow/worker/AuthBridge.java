package app.didisnow.worker;

import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name = "AuthBridge")
public class AuthBridge extends Plugin {
    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("worker_prefs", android.content.Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void saveToken(PluginCall call) {
        String token = call.getString("token", null);
        JSObject ret = new JSObject();
        if (token == null || token.isEmpty()) {
            call.reject("missing token");
            return;
        }
        
        // Use commit() instead of apply() for SYNCHRONOUS write
        // This ensures JWT is written to disk immediately
        boolean success = prefs().edit().putString("supabase_jwt", token).commit();
        
        if (success) {
            // Verify it was saved by reading it back
            String savedToken = prefs().getString("supabase_jwt", null);
            if (token.equals(savedToken)) {
                android.util.Log.d("AuthBridge", "✅ JWT token saved and verified");
                android.util.Log.d("AuthBridge", "🔑 Token preview: " + token.substring(0, Math.min(50, token.length())) + "...");
                ret.put("ok", true);
                call.resolve(ret);
            } else {
                android.util.Log.e("AuthBridge", "❌ JWT verification failed after save!");
                call.reject("verification_failed");
            }
        } else {
            android.util.Log.e("AuthBridge", "❌ Failed to commit JWT to SharedPreferences");
            call.reject("commit_failed");
        }
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        String token = prefs().getString("supabase_jwt", null);
        JSObject ret = new JSObject();
        ret.put("token", token);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        boolean success = prefs().edit()
            .remove("supabase_jwt")
            .remove("pending_fcm_token")
            .remove("pending_fcm_token_timestamp")
            .commit();
        if (success) {
            android.util.Log.d("AuthBridge", "🗑️ Cleared JWT + pending FCM token");
        } else {
            android.util.Log.e("AuthBridge", "❌ Failed to clear tokens");
        }
        JSObject ret = new JSObject();
        ret.put("ok", success);
        call.resolve(ret);
    }

    /**
     * Returns the pending FCM token saved natively by MyFirebaseService.onNewToken().
     * JS layer calls this on app start to sync token to backend when session is available.
     */
    @PluginMethod
    public void getPendingFCMToken(PluginCall call) {
        String token = prefs().getString("pending_fcm_token", null);
        long timestamp = prefs().getLong("pending_fcm_token_timestamp", 0);
        JSObject ret = new JSObject();
        ret.put("token", token);
        ret.put("timestamp", timestamp);
        call.resolve(ret);
    }

    /**
     * Clears only the pending FCM token after successful sync to backend.
     * Does NOT clear the JWT token.
     */
    @PluginMethod
    public void clearPendingFCMToken(PluginCall call) {
        boolean success = prefs().edit()
            .remove("pending_fcm_token")
            .remove("pending_fcm_token_timestamp")
            .commit();
        JSObject ret = new JSObject();
        ret.put("ok", success);
        call.resolve(ret);
    }

    /**
     * Persists the worker's user_id (Firebase UID) so background components
     * (BootReceiver, FcmBootSyncWorker, MyFirebaseService) can ping the backend
     * even when the JS layer is not running.
     */
    @PluginMethod
    public void saveUserId(PluginCall call) {
        String userId = call.getString("userId", null);
        JSObject ret = new JSObject();
        if (userId == null || userId.isEmpty()) {
            prefs().edit().remove("user_id").commit();
            ret.put("ok", true);
            ret.put("cleared", true);
            call.resolve(ret);
            return;
        }
        boolean ok = prefs().edit().putString("user_id", userId).commit();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void getUserId(PluginCall call) {
        String userId = prefs().getString("user_id", null);
        JSObject ret = new JSObject();
        ret.put("userId", userId);
        call.resolve(ret);
    }

    /** Returns the persisted ring-buffer log (JSON array string). */
    @PluginMethod
    public void readWorkerLog(PluginCall call) {
        String json = WorkerLog.INSTANCE.read(getContext());
        JSObject ret = new JSObject();
        ret.put("log", json);
        call.resolve(ret);
    }

    /** Diagnostic snapshot for the AuthDebug screen. */
    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject ret = new JSObject();
        ret.put("userId", p.getString("user_id", null));
        ret.put("isLoggedIn", p.getBoolean("is_logged_in", false));
        ret.put("isAvailable", p.getBoolean("is_available", false));
        ret.put("pendingFcmToken", p.getString("pending_fcm_token", null));
        ret.put("pendingFcmTokenAt", p.getLong("pending_fcm_token_timestamp", 0L));
        ret.put("manufacturer", android.os.Build.MANUFACTURER);
        ret.put("model", android.os.Build.MODEL);
        ret.put("androidVersion", android.os.Build.VERSION.RELEASE);
        try {
            android.os.PowerManager pm = (android.os.PowerManager)
                getContext().getSystemService(android.content.Context.POWER_SERVICE);
            ret.put(
                "ignoringBatteryOptimizations",
                pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName())
            );
        } catch (Exception e) {
            ret.put("ignoringBatteryOptimizations", false);
        }
        try {
            boolean notifEnabled = androidx.core.app.NotificationManagerCompat
                .from(getContext()).areNotificationsEnabled();
            ret.put("notificationsEnabled", notifEnabled);
        } catch (Exception e) {
            ret.put("notificationsEnabled", false);
        }
        call.resolve(ret);
    }
}
