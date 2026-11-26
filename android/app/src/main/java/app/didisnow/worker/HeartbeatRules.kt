package app.didisnow.worker

/**
 * Pure rules for the native heartbeat body. The live receiver accepts only
 * "foreground" | "background" as app_state (anything else → 400 invalid_request);
 * the trigger (interval, fcm_received, boot event…) is sent as heartbeat_reason.
 */
object HeartbeatRules {
    private val FOREGROUND_REASONS = setOf("foreground", "open", "login")

    fun appStateFor(reason: String): String =
        if (reason in FOREGROUND_REASONS) "foreground" else "background"
}
