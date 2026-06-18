package app.didisnow.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat

/**
 * Handles "Decline" tapped from the heads-up incoming-call notification when the
 * worker doesn't open the full-screen IncomingCallActivity directly.
 */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.getStringExtra("action") ?: return
        val bookingId = intent.getStringExtra("booking_id") ?: ""
        Log.d("CallActionReceiver", "action=$action booking_id=$bookingId")
        // Dismiss the heads-up notification
        try {
            NotificationManagerCompat.from(context).cancel(98765)
        } catch (_: Exception) {}
        // Future: ack decline to backend via BackendSync
    }
}
