package app.didisnow.worker

import android.content.Intent
import android.content.Context

/**
 * Authoritative offer countdown helper.
 *
 * Only the server row's expiry owns the window. No send-time/local TTL fallback.
 * Missing expiry is recovered with the verified worker login off the UI thread.
 */
object OfferTimer {
    const val DEFAULT_TTL_SECONDS = 60
    /** Must run off the main thread. Failure leaves an undated offer non-actionable. */
    fun recover(ctx: Context, intent: Intent): Boolean {
        if (intent.getLongExtra("expires_at", 0L) > 0L) return remainingSecondsFrom(intent) > 0
        return try {
            val jwt = BackendSync.sessionJwt(ctx) ?: return false
            val bookingId = intent.getStringExtra("booking_id")?.takeIf { it.isNotBlank() } ?: return false
            val deadline = OwnOfferPreflight.deadline("https://paywwbuqycovjopryele.supabase.co",
                BackendSync.ANON_KEY_PUBLIC, jwt, bookingId, intent.getStringExtra("booking_request_id"))
            intent.putExtra("expires_at", deadline)
            remainingSecondsFrom(intent) > 0
        } catch (_: Exception) { false }
    }
    fun deadlineFrom(intent: Intent?): Long = AlertPresentationRules.deadline(
        intent?.getLongExtra("expires_at", 0L) ?: 0L,
        intent?.getLongExtra("sent_at", 0L) ?: 0L,
        intent?.getIntExtra("ttl_seconds", DEFAULT_TTL_SECONDS) ?: DEFAULT_TTL_SECONDS,
        System.currentTimeMillis() / 1000
    )

    fun remainingUntil(deadline: Long): Int =
        AlertPresentationRules.remaining(deadline, System.currentTimeMillis() / 1000)

    /** Reads expiry hints from an Intent and returns the seconds to display. */
    fun remainingSecondsFrom(intent: Intent?): Int {
        if (intent == null) return 0
        val expiresAt = intent.getLongExtra("expires_at", 0L)
        val sentAt = intent.getLongExtra("sent_at", 0L)
        val ttl = intent.getIntExtra("ttl_seconds", DEFAULT_TTL_SECONDS)
            .takeIf { it in 1..600 } ?: DEFAULT_TTL_SECONDS
        return remainingSeconds(expiresAt, sentAt, ttl)
    }

    fun remainingSeconds(expiresAtEpochSec: Long, sentAtEpochSec: Long, ttlSeconds: Int): Int {
        val now = System.currentTimeMillis() / 1000
        return AlertPresentationRules.remaining(
            AlertPresentationRules.deadline(expiresAtEpochSec, sentAtEpochSec, ttlSeconds, now), now
        )
    }
}
