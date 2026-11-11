package app.didisnow.worker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "PracticeNotifications")
class PracticeNotificationsPlugin : Plugin() {
    @PluginMethod fun prepare(call: PluginCall) {
        val id = call.getString("id") ?: ""
        val expiry = call.getDouble("expiresAt")?.toLong() ?: 0L
        val now = System.currentTimeMillis()
        val busy = OfferQueue.isLocallyBusy(context) || OfferQueue.hasLiveOffer(context)
        val permitted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val valid = id.startsWith("practice-") && expiry > now && expiry <= now + 65000
        val reply = JSObject().put("ready", !busy && permitted && valid)
        if (busy) reply.put("reason", "busy") else if (!permitted) reply.put("reason", "permission") else if (!valid) reply.put("reason", "invalid_session")
        if (!busy && permitted && valid) PracticeSession.prepare(context, id, expiry)
        call.resolve(reply)
    }
    @PluginMethod fun getState(call: PluginCall) { call.resolve(PracticeSession.state(context)) }
    @PluginMethod fun cancel(call: PluginCall) {
        PracticeSession.cancel(context)
        call.resolve()
    }
}

object PracticeSession {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("practice_booking_only", Context.MODE_PRIVATE)
    fun prepare(ctx: Context, id: String, expiry: Long) {
        cancel(ctx)
        prefs(ctx).edit().clear().putString("id", id).putLong("expiresAt", expiry).apply()
    }
    fun matches(ctx: Context, id: String): Boolean = id.startsWith("practice-") && prefs(ctx).getString("id", "") == id && prefs(ctx).getLong("expiresAt", 0) > System.currentTimeMillis() && prefs(ctx).getString("outcome", "").isNullOrEmpty()
    fun expiry(ctx: Context): Long = prefs(ctx).getLong("expiresAt", 0)
    fun id(ctx: Context): String = prefs(ctx).getString("id", "") ?: ""
    fun mark(ctx: Context, key: String) { prefs(ctx).edit().putBoolean(key, true).apply() }
    fun outcome(ctx: Context, value: String) { prefs(ctx).edit().putString("outcome", value).apply() }
    fun state(ctx: Context): JSObject {
        val p = prefs(ctx)
        return JSObject().put("id", id(ctx)).put("received", p.getBoolean("received", false)).put("overlay", p.getBoolean("overlay", false)).put("outcome", p.getString("outcome", ""))
    }
    fun cancel(ctx: Context) {
        prefs(ctx).edit().putString("outcome", "cancelled").apply()
        ctx.stopService(Intent(ctx, PracticeAlertService::class.java))
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        manager.cancel(812340)
    }
}
