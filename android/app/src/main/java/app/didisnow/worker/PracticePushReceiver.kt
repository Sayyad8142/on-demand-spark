package app.didisnow.worker

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat

/** This receiver never enters OfferQueue, BackendSync, ACKs or production booking handlers. */
object PracticePushReceiver {
    @JvmStatic fun receive(ctx: Context, data: Map<String, String>) {
        val id = data["practice_id"] ?: return
        val expiresAt = data["expires_at"]?.toLongOrNull() ?: return
        // Wrong id/login/expiry or a duplicate FCM delivery → silent drop. A push bound to a
        // different device token, or one arriving too late after the server's work check → blocked.
        when (PracticeSession.claimReceipt(ctx, id, expiresAt, data["token_sha256"])) {
            "ok" -> Unit
            "wrong_device", "stale" -> { PracticeSession.outcome(ctx, id, "blocked"); return }
            else -> return
        }
        if (PracticeSession.realWorkSuspected(ctx) || !PracticeSession.canNotify(ctx)) {
            PracticeSession.outcome(ctx, id, "blocked")
            return
        }
        val sound = Uri.parse("android.resource://${ctx.packageName}/${R.raw.new_loud_ringtone}")
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val tap = PendingIntent.getActivity(ctx, PracticeSession.NOTIFICATION_ID, Intent(ctx, PracticeAlertActivity::class.java).putExtra("practice_id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val remaining = (expiresAt - System.currentTimeMillis()).coerceIn(1000L, 60000L)
        manager.notify(PracticeSession.NOTIFICATION_ID, NotificationCompat.Builder(ctx, PracticeSession.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("TEST BOOKING — Practice Only")
            .setContentText("₹100 • Dishwashing • Flat 001").setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSound(sound).setVibrate(longArrayOf(0, 1000, 500)).setContentIntent(tap).setAutoCancel(true).setTimeoutAfter(remaining).build())
        // No full-screen intent or new mandatory permissions. Optional overlay
        // uses the same layout; without overlay permission the worker taps the tray.
        if (MainActivity.canOpenBookingActivity(ctx)) {
            try { ctx.startActivity(Intent(ctx, PracticeAlertActivity::class.java).putExtra("practice_id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            catch (_: Exception) { /* Notification tap remains available. */ }
        } else if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)) {
            try { ctx.startService(Intent(ctx, PracticeAlertService::class.java).putExtra("practice_id", id)) }
            catch (_: Exception) { /* Tray remains; overlay stays Not Verified. */ }
        }
    }
}
