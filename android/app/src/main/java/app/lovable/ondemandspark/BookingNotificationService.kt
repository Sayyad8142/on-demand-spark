package app.lovable.ondemandspark

import android.app.Notification
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.onesignal.notifications.INotificationReceivedEvent
import com.onesignal.notifications.INotificationServiceExtension

class BookingNotificationService : INotificationServiceExtension {
    override fun onNotificationReceived(event: INotificationReceivedEvent) {
        val notification = event.notification
        val additionalData = notification.additionalData
        
        val type = additionalData?.optString("type") ?: ""
        if (type != "BOOKING_ALERT") {
            // Let OneSignal display the notification normally
            return
        }

        // This is a booking alert - show full screen intent
        val bookingId = additionalData.optString("bookingId", "")
        val customer = additionalData.optString("customer", "")
        val community = additionalData.optString("community", "")
        val serviceType = additionalData.optString("serviceType", "")

        val intent = Intent(event.context, BookingAlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("bookingId", bookingId)
            putExtra("customer", customer)
            putExtra("community", community)
            putExtra("serviceType", serviceType)
        }

        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val fullScreenPI = PendingIntent.getActivity(event.context, 0, intent, piFlags)

        // Modify the notification to include full screen intent
        val modifiedNotification = event.notification
        event.notification = modifiedNotification
        
        // Create a custom notification with full screen intent
        val notificationBuilder = NotificationCompat.Builder(event.context, "default")
            .setSmallIcon(R.drawable.ic_stat_onesignal_default)
            .setContentTitle(notification.title ?: "New Booking")
            .setContentText(notification.body ?: "You have a new booking request")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPI, true)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        // Display the notification
        event.notification = modifiedNotification
    }
}
