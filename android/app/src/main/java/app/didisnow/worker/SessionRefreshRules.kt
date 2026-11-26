package app.didisnow.worker

/**
 * Pure rules for native login refresh (no Android deps; checked by
 * scripts/check-session-rules.sh). Heartbeat and delivery confirmations must
 * carry the worker's OWN Supabase login; the public key is never a substitute.
 */
object SessionRefreshRules {
    /** After a failed refresh, wait this long before trying again (battery + abuse safety). */
    const val REFRESH_FAIL_BACKOFF_MS = 5 * 60_000L

    fun mayAttemptRefresh(nowMs: Long, lastFailMs: Long): Boolean =
        lastFailMs <= 0L || nowMs - lastFailMs >= REFRESH_FAIL_BACKOFF_MS

    /** A refreshed login is used only if it belongs to the same account that was stored. */
    fun acceptRefreshed(storedUserId: String?, newUserId: String?, newAccessToken: String?): Boolean =
        !storedUserId.isNullOrBlank() && !newAccessToken.isNullOrBlank() &&
            (newUserId.isNullOrBlank() || newUserId == storedUserId)

    /** One re-authentication retry on 401/403, never a loop. */
    fun retryAfterAuthFailure(code: Int, alreadyRetried: Boolean): Boolean =
        !alreadyRetried && (code == 401 || code == 403)

    /** Refresh-token grant refused by Auth: the worker must sign in again in the app. */
    fun loginNeedsReauth(code: Int): Boolean = code == 400 || code == 401 || code == 403
}
