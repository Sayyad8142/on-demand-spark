package app.didisnow.worker

/**
 * Pure rules for authenticated background calls (no Android deps; checked by
 * scripts/check-session-rules.sh). Boot ping, keepalive ACK, missed-booking
 * reports and Admin test-notification confirmations never fall back to the
 * public key or a phone-supplied worker id.
 */
object BackgroundAuthRules {
    /** Calls waiting for a login are kept at most this long / this many. */
    const val PENDING_MAX_AGE_MS = 24L * 60 * 60 * 1000
    const val PENDING_MAX_ENTRIES = 20
    const val PENDING_MAX_ATTEMPTS = 5
    /** WorkManager retries for keepalive / boot sync before giving up. */
    const val WORKER_MAX_RUNS = 5

    enum class Outcome { OK, RETRY_LATER, WAIT_FOR_LOGIN, DROP }

    /** 401/403 after one forced refresh = wait for the worker to sign in; never loop. */
    fun classify(code: Int, hadLogin: Boolean): Outcome = when {
        !hadLogin -> Outcome.WAIT_FOR_LOGIN
        code in 200..299 -> Outcome.OK
        code == 401 || code == 403 -> Outcome.WAIT_FOR_LOGIN
        code == 408 || code == 429 || code >= 500 || code <= 0 -> Outcome.RETRY_LATER
        else -> Outcome.DROP // 400/404/409: the same request will never succeed
    }

    fun keepPending(nowMs: Long, createdMs: Long, attempts: Int): Boolean =
        nowMs - createdMs in 0..PENDING_MAX_AGE_MS && attempts < PENDING_MAX_ATTEMPTS

    /**
     * Booking delivery ACK follow-up. The only retry is ONE login retry on
     * 401/403 for delivery confirmations; a 400 is final (the old retry that
     * dropped ack_token and used the public key is gone).
     */
    fun ackSessionRetry(event: String, code: Int, sentToken: Boolean, hasLogin: Boolean): Boolean =
        sentToken && hasLogin && (code == 401 || code == 403) &&
            event in setOf("push_received", "popup_shown", "worker_seen")

    data class Probe(val probeId: String, val workerId: String, val ackToken: String, val showOverlay: Boolean)

    private val UUID_RE = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    fun isProbeType(type: String?): Boolean = type != null && type.equals("telemetry_probe", ignoreCase = true)

    /** Admin test notification. Missing/invalid ids or token = ignored (never a booking). */
    fun parseProbe(data: Map<String, String?>): Probe? {
        if (!isProbeType(data["type"])) return null
        val probeId = data["probe_id"]?.trim().orEmpty()
        val workerId = data["worker_id"]?.trim().orEmpty()
        val token = data["ack_token"]?.trim().orEmpty()
        if (!UUID_RE.matches(probeId) || !UUID_RE.matches(workerId) || token.isEmpty()) return null
        val show = data["show_overlay"]?.trim()?.lowercase() in setOf("true", "1", "yes")
        return Probe(probeId, workerId, token, show)
    }
}
