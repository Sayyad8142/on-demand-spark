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
        boolean success = prefs().edit().remove("supabase_jwt").commit();
        if (success) {
            android.util.Log.d("AuthBridge", "🗑️ Cleared JWT token");
        } else {
            android.util.Log.e("AuthBridge", "❌ Failed to clear JWT token");
        }
        JSObject ret = new JSObject();
        ret.put("ok", success);
        call.resolve(ret);
    }
}
