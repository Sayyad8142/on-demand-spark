package app.didisnow.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** One native tray path for FCM, foreground offers and failed pop-ups. */
object BookingNotifications {
    private const val CHANNEL = "booking_alerts"

    @JvmStatic fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL, "Booking Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Urgent booking notifications"
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 200, 500)
            setSound(Uri.parse("android.resource://${ctx.packageName}/${R.raw.new_loud_ringtone}"),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        }
        ctx.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        // Android preserves the worker's existing channel/sound choices.
    }

    @JvmStatic fun post(ctx: Context, bookingId: String?, source: Intent?): Boolean {
        ensureChannel(ctx)
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false
        val seconds = source?.let { OfferTimer.remainingSecondsFrom(it) }
        if (seconds != null && seconds <= 0) return false
        val target = if (source != null) Intent(ctx, BookingAlertActivity::class.java).apply {
            putExtras(source)
            putExtra("from_notification", true)
        } else Intent(ctx, MainActivity::class.java).putExtra("navigate_to", "bookings")
        target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val id = OfferQueue.notificationIdFor(bookingId)
        val tap = PendingIntent.getActivity(ctx, id, target, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("New Booking").setContentText("New Booking")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setAutoCancel(true).setOnlyAlertOnce(true)
            .setSound(Uri.parse("android.resource://${ctx.packageName}/${R.raw.new_loud_ringtone}"))
            .setVibrate(longArrayOf(0, 500, 200, 500)).setContentIntent(tap)
        seconds?.let { notification.setTimeoutAfter(it * 1000L) }
        return try {
            NotificationManagerCompat.from(ctx).notify(id, notification.build())
            true
        } catch (_: SecurityException) { false }
    }
}