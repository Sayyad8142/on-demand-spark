package app.didisnow.worker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.messaging.FirebaseMessaging
import java.security.MessageDigest

@CapacitorPlugin(name = "PracticeNotifications")
class PracticeNotificationsPlugin : Plugin() {
    @PluginMethod fun prepare(call: PluginCall) {
        val id = call.getString("id") ?: ""
        val userId = call.getString("userId") ?: ""
        val expiry = call.getDouble("expiresAt")?.toLong() ?: 0L
        val now = System.currentTimeMillis()
        val reply = JSObject().put("ready", false)
        val valid = id.startsWith("practice-") && expiry > now && expiry <= now + 65000 && userId.isNotEmpty()
        when {
            !valid -> { call.resolve(reply.put("reason", "invalid_session")); return }
            // Native login must be the same account the web layer is testing.
            PracticeSession.nativeUser(context) != userId -> { call.resolve(reply.put("reason", "account_mismatch")); return }
            PracticeSession.realWorkSuspected(context) -> { call.resolve(reply.put("reason", "busy")); return }
            !PracticeSession.canNotify(context) -> { call.resolve(reply.put("reason", "permission")); return }
        }
        // Fingerprint of THIS phone's current FCM token. It lets the server confirm the
        // stored token is this device; it never authorizes identity by itself.
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val token = if (task.isSuccessful) task.result else null
            if (token.isNullOrEmpty()) { call.resolve(reply.put("reason", "token_missing")); return@addOnCompleteListener }
            // Token retrieval is asynchronous: recheck login, expiry, work and permission.
            if (PracticeSession.nativeUser(context) != userId || expiry <= System.currentTimeMillis() || PracticeSession.realWorkSuspected(context) || !PracticeSession.canNotify(context)) {
                call.resolve(reply.put("reason", "busy")); return@addOnCompleteListener
            }
            val sha = PracticeSession.sha256(token)
            PracticeSession.prepare(context, id, expiry, userId, sha)
            call.resolve(JSObject().put("ready", true).put("tokenSha256", sha))
        }
    }
    @PluginMethod fun getState(call: PluginCall) { call.resolve(PracticeSession.state(context)) }
    @PluginMethod fun cancel(call: PluginCall) {
        PracticeSession.cancel(context)
        call.resolve()
    }
}

object PracticeSession {
    const val NOTIFICATION_ID = 812340
    const val CHANNEL_ID = "practice_bookings"
    private val lock = Any()
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("practice_booking_only", Context.MODE_PRIVATE)
    fun nativeUser(ctx: Context): String = ctx.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE).getString("user_id", "") ?: ""
    fun sha256(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    /** Time-windowed native busy flag or any live offer. Never proof of "idle";
     * the server re-checks real work twice and the 60s window bounds the gap. */
    fun realWorkSuspected(ctx: Context): Boolean =
        try { OfferQueue.isLocallyBusy(ctx) || OfferQueue.hasLiveOffer(ctx) } catch (_: Exception) { true }

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val sound = Uri.parse("android.resource://${ctx.packageName}/${R.raw.new_loud_ringtone}")
        val channel = NotificationChannel(CHANNEL_ID, "Practice bookings", NotificationManager.IMPORTANCE_HIGH)
        channel.setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 1000, 500)
        manager.createNotificationChannel(channel)
    }
    /** App notifications on, POST_NOTIFICATIONS granted, practice channel not blocked. */
    fun canNotify(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) return false
        ensureChannel(ctx)
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = manager.getNotificationChannel(CHANNEL_ID) ?: return false
            if (ch.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    /** A practice push must arrive within this window after the phone prepared it (phone clock only,
     * so server/phone clock skew cannot widen it). Bounds the gap after the server's last real-work check. */
    const val MAX_RECEIPT_DELAY_MS = 30_000L
    @JvmOverloads fun prepare(ctx: Context, id: String, expiry: Long, userId: String, tokenSha: String, now: Long = System.currentTimeMillis()) {
        cancel(ctx)
        prefs(ctx).edit().clear().putString("id", id).putLong("expiresAt", expiry).putLong("preparedAt", now)
            .putString("userId", userId).putString("tokenSha", tokenSha).commit()
    }
    /** Same id, unexpired, no outcome yet, and still the same native login. */
    fun matches(ctx: Context, id: String): Boolean {
        val p = prefs(ctx)
        return id.startsWith("practice-") && p.getString("id", "") == id && p.getLong("expiresAt", 0) > System.currentTimeMillis() &&
            p.getString("outcome", "").isNullOrEmpty() && !p.getString("userId", "").isNullOrEmpty() && p.getString("userId", "") == nativeUser(ctx)
    }
    /** Atomic first-receipt claim. Returns "ok" once; "drop" for another session/login/duplicate
     * (silent, never replays sound); "wrong_device" when the push was addressed to a different
     * token than this phone prepared; "stale" when it arrived too late. Callers block on the last two. */
    @JvmOverloads fun claimReceipt(ctx: Context, id: String, expiresAt: Long, tokenSha: String?, now: Long = System.currentTimeMillis()): String {
        synchronized(lock) {
            val p = prefs(ctx)
            if (!matches(ctx, id) || p.getLong("expiresAt", 0) != expiresAt) return "drop"
            if (p.getLong("receivedAt", 0) > 0) return "drop"
            val bound = p.getString("tokenSha", "") ?: ""
            if (tokenSha.isNullOrEmpty() || bound.isEmpty() || bound != tokenSha) return "wrong_device"
            val preparedAt = p.getLong("preparedAt", 0)
            if (preparedAt <= 0 || now < preparedAt || now - preparedAt > MAX_RECEIPT_DELAY_MS) return "stale"
            return if (p.edit().putBoolean("received", true).putLong("receivedAt", now).commit()) "ok" else "drop"
        }
    }
    fun expiry(ctx: Context): Long = prefs(ctx).getLong("expiresAt", 0)
    fun id(ctx: Context): String = prefs(ctx).getString("id", "") ?: ""
    fun markOverlay(ctx: Context, id: String) {
        synchronized(lock) {
            if (matches(ctx, id) && !realWorkSuspected(ctx)) prefs(ctx).edit().putBoolean("overlay", true).putLong("overlayAt", System.currentTimeMillis()).commit()
        }
    }
    /** First outcome wins. */
    fun outcome(ctx: Context, id: String, value: String): Boolean {
        synchronized(lock) {
            val p = prefs(ctx)
            if (p.getString("id", "") != id || !p.getString("outcome", "").isNullOrEmpty()) return false
            val e = p.edit().putString("outcome", value)
            if (value == "accepted") e.putLong("acceptedAt", System.currentTimeMillis())
            return e.commit()
        }
    }
    fun state(ctx: Context): JSObject {
        val p = prefs(ctx)
        val bound = p.getString("userId", "") ?: ""
        // A session from another login reports nothing.
        if (bound.isEmpty() || bound != nativeUser(ctx)) return JSObject().put("id", "").put("received", false).put("overlay", false).put("outcome", "")
        val out = JSObject().put("id", id(ctx)).put("userId", bound).put("received", p.getBoolean("received", false))
            .put("overlay", p.getBoolean("overlay", false)).put("outcome", p.getString("outcome", ""))
        if (p.getLong("acceptedAt", 0) > 0) out.put("acceptedAt", p.getLong("acceptedAt", 0))
        return out
    }
    fun cancel(ctx: Context) {
        synchronized(lock) { prefs(ctx).edit().clear().putString("outcome", "cancelled").commit() }
        stopUi(ctx)
    }
    fun stopUi(ctx: Context) {
        try { ctx.stopService(Intent(ctx, PracticeAlertService::class.java)) } catch (_: Exception) {}
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID) } catch (_: Exception) {}
        try { ctx.sendBroadcast(Intent(PracticeAlertActivity.ACTION_CLOSE).setPackage(ctx.packageName)) } catch (_: Exception) {}
    }
    /** A real message arrived: practice yields immediately. Never throws into the caller. */
    @JvmStatic fun preempt(ctx: Context) {
        try {
            val id = id(ctx)
            if (id.isEmpty() || !prefs(ctx).getString("outcome", "").isNullOrEmpty()) return
            outcome(ctx, id, "blocked"); stopUi(ctx)
        } catch (_: Exception) {}
    }
    @JvmStatic fun onTokenChanged(ctx: Context) { try { if (id(ctx).isNotEmpty()) cancel(ctx) } catch (_: Exception) {} }
}
