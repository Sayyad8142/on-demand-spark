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
        prefs().edit().putString("supabase_jwt", token).apply();
        android.util.Log.d("AuthBridge", "✅ Saved JWT token");
        ret.put("ok", true);
        call.resolve(ret);
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
        prefs().edit().remove("supabase_jwt").apply();
        android.util.Log.d("AuthBridge", "🗑️ Cleared JWT token");
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
