import app.didisnow.worker.SessionRefreshRules as R
import app.didisnow.worker.HeartbeatRules as H

private fun check(name: String, ok: Boolean) { if (!ok) { println("FAIL $name"); kotlin.system.exitProcess(1) } else println("ok   $name") }

fun main() {
    check("first refresh allowed", R.mayAttemptRefresh(1_000L, 0L))
    check("backoff after failure", !R.mayAttemptRefresh(60_000L, 1_000L))
    check("retry after 5 min", R.mayAttemptRefresh(1_000L + 5 * 60_000L, 1_000L))
    check("same account accepted", R.acceptRefreshed("u1", "u1", "jwt"))
    check("other account refused", !R.acceptRefreshed("u1", "u2", "jwt"))
    check("no stored account refused", !R.acceptRefreshed(null, "u1", "jwt"))
    check("empty token refused", !R.acceptRefreshed("u1", "u1", ""))
    check("401 retried once", R.retryAfterAuthFailure(401, false) && !R.retryAfterAuthFailure(401, true))
    check("403 retried once", R.retryAfterAuthFailure(403, false))
    check("500 not an auth retry", !R.retryAfterAuthFailure(500, false))
    check("refused grant needs sign-in", R.loginNeedsReauth(400) && !R.loginNeedsReauth(503))
    check("interval heartbeat sends background", H.appStateFor("interval") == "background")
    check("fcm/boot heartbeat sends background", H.appStateFor("fcm_received") == "background" && H.appStateFor("BOOT_COMPLETED") == "background")
    check("app open heartbeat sends foreground", H.appStateFor("foreground") == "foreground" && H.appStateFor("open") == "foreground")
    backgroundAuthChecks()
    println("session rules: all passed")
}

private val B = app.didisnow.worker.BackgroundAuthRules
fun backgroundAuthChecks() {
    check("no login waits, never public key", B.classify(200, hadLogin = false) == app.didisnow.worker.BackgroundAuthRules.Outcome.WAIT_FOR_LOGIN)
    check("401 after refresh waits for sign-in", B.classify(401, true) == app.didisnow.worker.BackgroundAuthRules.Outcome.WAIT_FOR_LOGIN)
    check("400 is final", B.classify(400, true) == app.didisnow.worker.BackgroundAuthRules.Outcome.DROP)
    check("503 retried later", B.classify(503, true) == app.didisnow.worker.BackgroundAuthRules.Outcome.RETRY_LATER)
    check("pending expires after 24h", !B.keepPending(25L * 3600_000, 0L, 0) && B.keepPending(1_000L, 0L, 0))
    check("pending stops after 5 attempts", !B.keepPending(1_000L, 0L, 5))
    check("ack 400 never retried", !B.ackSessionRetry("push_received", 400, true, true))
    check("ack 401 retried once with login", B.ackSessionRetry("popup_shown", 401, true, true))
    check("taps never use fallback", !B.ackSessionRetry("accept_tapped", 401, true, true))
    val id = "11111111-2222-3333-4444-555555555555"
    val p = B.parseProbe(mapOf("type" to "telemetry_probe", "probe_id" to id, "worker_id" to id, "ack_token" to "t", "show_overlay" to "true"))
    check("probe keeps ids, token, overlay", p != null && p.probeId == id && p.workerId == id && p.ackToken == "t" && p.showOverlay)
    check("probe without token ignored", B.parseProbe(mapOf("type" to "telemetry_probe", "probe_id" to id, "worker_id" to id)) == null)
    check("show_overlay false respected", B.parseProbe(mapOf("type" to "telemetry_probe", "probe_id" to id, "worker_id" to id, "ack_token" to "t", "show_overlay" to "false"))?.showOverlay == false)
    check("booking alert is not a probe", !B.isProbeType("BOOKING_ALERT"))
}
