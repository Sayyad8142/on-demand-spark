package app.didisnow.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat

/** This receiver never enters OfferQueue, BackendSync or production booking handlers. */
object PracticePushReceiver {
    @JvmStatic fun receive(ctx: Context, data: Map<String, String>) {
        val id = data["practice_id"] ?: return
        if (!PracticeSession.matches(ctx, id)) return
        PracticeSession.mark(ctx, "received")
        if (OfferQueue.isLocallyBusy(ctx) || OfferQueue.hasLiveOffer(ctx)) {
            PracticeSession.outcome(ctx, "blocked")
            return
        }
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) {
            PracticeSession.outcome(ctx, "blocked")
            return
        }
        val sound = Uri.parse("android.resource://${ctx.packageName}/${R.raw.new_loud_ringtone}")
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel("practice_bookings", "Practice bookings", NotificationManager.IMPORTANCE_HIGH)
            channel.setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
            channel.enableVibration(true)
            channel.vibrationPattern = longArrayOf(0, 1000, 500)
            manager.createNotificationChannel(channel)
        }
        val tap = PendingIntent.getActivity(ctx, 812340, Intent(ctx, PracticeAlertActivity::class.java).putExtra("practice_id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(812340, NotificationCompat.Builder(ctx, "practice_bookings")
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("TEST BOOKING — Practice Only")
            .setContentText("₹100 • Dishwashing • Flat 001").setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSound(sound).setVibrate(longArrayOf(0,1000,500)).setContentIntent(tap).setAutoCancel(true).setTimeoutAfter(60000).build())
        // No full-screen intent or new mandatory permissions. Optional overlay
        // uses the same layout; without overlay permission the worker taps the tray.
        if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)) {
            try { ctx.startService(Intent(ctx, PracticeAlertService::class.java).putExtra("practice_id", id)) }
            catch (_: Exception) { /* Tray remains; overlay stays Not Verified. */ }
        }
    }
}
