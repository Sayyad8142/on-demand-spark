package app.didisnow.worker

import android.content.Intent
import android.util.Log

/**
 * Authoritative offer countdown helper.
 *
 * Backend `worker_ttl_seconds = 60`. The offer lifetime is owned by the backend;
 * the client countdown is purely visual — acceptance is always validated
 * server-side (a late accept is rejected cleanly by the acceptance function).
 *
 * Preferred source of truth (in order):
 *   1. `expires_at`      — epoch seconds of authoritative offer expiry
 *   2. `sent_at` + ttl   — offer creation/send time + ttl_seconds
 *   3. fallback          — DEFAULT_TTL_SECONDS (60)
 */
object OfferTimer {
    const val DEFAULT_TTL_SECONDS = 60
    private const val MIN_SECONDS = 5

    /** Reads expiry hints from an Intent and returns the seconds to display. */
    fun remainingSecondsFrom(intent: Intent?): Int {
        if (intent == null) return DEFAULT_TTL_SECONDS
        val expiresAt = intent.getLongExtra("expires_at", 0L)
        val sentAt = intent.getLongExtra("sent_at", 0L)
        val ttl = intent.getIntExtra("ttl_seconds", DEFAULT_TTL_SECONDS)
            .takeIf { it in 1..600 } ?: DEFAULT_TTL_SECONDS
        return remainingSeconds(expiresAt, sentAt, ttl)
    }

    fun remainingSeconds(expiresAtEpochSec: Long, sentAtEpochSec: Long, ttlSeconds: Int): Int {
        val now = System.currentTimeMillis() / 1000
        val computed: Int = when {
            expiresAtEpochSec > 0 -> (expiresAtEpochSec - now).toInt()
            sentAtEpochSec > 0 -> (sentAtEpochSec + ttlSeconds - now).toInt()
            else -> {
                Log.w("OfferTimer", "⏱️ No expiry in payload — falling back to ${ttlSeconds}s")
                ttlSeconds
            }
        }
        val clamped = computed.coerceIn(MIN_SECONDS, ttlSeconds)
        Log.d(
            "OfferTimer",
            "⏱️ expires_at=$expiresAtEpochSec sent_at=$sentAtEpochSec ttl=$ttlSeconds → ${clamped}s"
        )
        return clamped
    }
}
