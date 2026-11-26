import app.didisnow.worker.SessionRefreshRules as R

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
    println("session rules: all passed")
}
