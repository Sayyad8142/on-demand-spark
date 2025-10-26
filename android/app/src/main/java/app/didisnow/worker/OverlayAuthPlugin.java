package app.didisnow.worker;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.PluginMethod;

/**
 * Plugin to share Supabase session between web and native Android
 * Used by BookingAlertActivity to authenticate API calls
 */
@CapacitorPlugin(name = "OverlayAuth")
public class OverlayAuthPlugin extends Plugin {
    private static final String PREF = "supabase_session_shared";
    private static final String KEY_AT = "accessToken";
    private static final String KEY_RT = "refreshToken";
    private static final String KEY_UID = "userId";
    private static final String KEY_EXP = "expiresAt";

    private SharedPreferences prefs() {
        Context ctx = getContext();
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void saveSession(PluginCall call) {
        String at = call.getString("accessToken", "");
        String rt = call.getString("refreshToken", "");
        String uid = call.getString("userId", "");
        long exp = call.getLong("expiresAt", 0L);

        android.util.Log.d("OverlayAuth", "Saving session - userId: " + uid + ", expiresAt: " + exp);
        
        prefs().edit()
            .putString(KEY_AT, at)
            .putString(KEY_RT, rt)
            .putString(KEY_UID, uid)
            .putLong(KEY_EXP, exp)
            .apply();

        android.util.Log.d("OverlayAuth", "✅ Session saved successfully");
        
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        android.util.Log.d("OverlayAuth", "Clearing session");
        prefs().edit().clear().apply();
        
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    // Static helper methods for native classes to access session
    public static String getAccessToken(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_AT, "");
    }

    public static String getRefreshToken(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_RT, "");
    }

    public static String getUserId(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_UID, "");
    }

    public static long getExpiresAt(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(KEY_EXP, 0L);
    }
}
