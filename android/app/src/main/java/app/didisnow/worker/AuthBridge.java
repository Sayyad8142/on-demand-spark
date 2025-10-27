package app.didisnow.worker;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AuthBridge")
public class AuthBridge extends Plugin {
    private static final String TAG = "AuthBridge";
    private static final String PREF_NAME = "didi_session";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_EXPIRES_AT_MS = "expires_at_ms";  // Store in MILLISECONDS
    private static final String KEY_USER_ID = "user_id";

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String accessToken = call.getString("accessToken", "");
        String refreshToken = call.getString("refreshToken", "");
        Long expiresAt = call.getLong("expiresAt");  // EXPECTS milliseconds
        String userId = call.getString("userId", "");

        long expiresAtMs = expiresAt != null ? expiresAt : 0L;
        long now = System.currentTimeMillis();
        long hoursUntilExpiry = (expiresAtMs - now) / (1000 * 60 * 60);

        Log.d(TAG, "💾 setSession called:");
        Log.d(TAG, "   - userId: " + userId);
        Log.d(TAG, "   - accessToken length: " + accessToken.length());
        Log.d(TAG, "   - refreshToken length: " + refreshToken.length());
        Log.d(TAG, "   - expiresAtMs: " + expiresAtMs);
        Log.d(TAG, "   - now: " + now);
        Log.d(TAG, "   - hours until expiry: " + hoursUntilExpiry);

        getPrefs().edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_EXPIRES_AT_MS, expiresAtMs)
            .putString(KEY_USER_ID, userId)
            .commit(); // Use commit for immediate write

        // Verify the values were written correctly
        String savedToken = getPrefs().getString(KEY_ACCESS_TOKEN, "");
        long savedExpiresAt = getPrefs().getLong(KEY_EXPIRES_AT_MS, 0L);
        Log.d(TAG, "✅ Session saved and verified:");
        Log.d(TAG, "   - saved token length: " + savedToken.length());
        Log.d(TAG, "   - saved expiresAtMs: " + savedExpiresAt);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        SharedPreferences prefs = getPrefs();
        
        JSObject ret = new JSObject();
        ret.put("accessToken", prefs.getString(KEY_ACCESS_TOKEN, ""));
        ret.put("refreshToken", prefs.getString(KEY_REFRESH_TOKEN, ""));
        ret.put("expiresAt", prefs.getLong(KEY_EXPIRES_AT_MS, 0L));  // Return milliseconds
        ret.put("userId", prefs.getString(KEY_USER_ID, ""));
        
        call.resolve(ret);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        Log.d(TAG, "🗑️ Clearing session");
        
        getPrefs().edit().clear().commit();
        
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // Static helper methods for Kotlin/Java code to access session
    public static String getAccessToken(Context ctx) {
        return ctx.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ACCESS_TOKEN, "");
    }

    public static String getRefreshToken(Context ctx) {
        return ctx.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_REFRESH_TOKEN, "");
    }

    public static long getExpiresAt(Context ctx) {
        return ctx.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getLong(KEY_EXPIRES_AT_MS, 0L);  // Return milliseconds
    }

    public static String getUserId(Context ctx) {
        return ctx.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getString(KEY_USER_ID, "");
    }

    public static void clearSessionStatic(Context ctx) {
        ctx.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit().clear().commit();
    }
}
