package app.didisnow.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.onesignal.notifications.INotificationReceivedEvent
import com.onesignal.notifications.INotificationServiceExtension

class BookingNotificationService : INotificationServiceExtension {
    companion object {
        private const val CHANNEL_ID = "booking_alerts"
        private const val NOTIFICATION_ID = 9999
    }

    override fun onNotificationReceived(event: INotificationReceivedEvent) {
        val notification = event.notification
        val additionalData = notification.additionalData
        
        val type = additionalData?.optString("type") ?: ""
        if (type != "BOOKING_ALERT") {
            // Let OneSignal display the notification normally
            return
        }

        // This is a booking alert - show system-wide overlay
        val bookingId = additionalData.optString("bookingId", "")
        val customer = additionalData.optString("customer", "")
        val community = additionalData.optString("community", "")
        val serviceType = additionalData.optString("serviceType", "")

        // Create notification channel with HIGH importance
        createNotificationChannel(event.context)

        // Start overlay service to show alert on top of all apps
        val overlayIntent = Intent(event.context, BookingOverlayService::class.java).apply {
            putExtra("bookingId", bookingId)
            putExtra("customer", customer)
            putExtra("community", community)
            putExtra("serviceType", serviceType)
        }
        event.context.startService(overlayIntent)

        // Also create a fallback notification with full screen intent
        val activityIntent = Intent(event.context, BookingAlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("bookingId", bookingId)
            putExtra("customer", customer)
            putExtra("community", community)
            putExtra("serviceType", serviceType)
        }

        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val fullScreenPI = PendingIntent.getActivity(event.context, 0, activityIntent, piFlags)

        // Create high-priority notification with full screen intent
        val notificationManager = event.context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notificationBuilder = NotificationCompat.Builder(event.context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(notification.title ?: "New Booking Request!")
            .setContentText(notification.body ?: "Tap to respond")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPI, true)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)

        // Display the notification
        notificationManager.notify(NOTIFICATION_ID, notificationBuilder.build())
        
        // Prevent OneSignal from showing its own notification
        event.preventDefault()
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Booking Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for new booking requests"
                enableVibration(true)
                enableLights(true)
                setBypassDnd(true)
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
