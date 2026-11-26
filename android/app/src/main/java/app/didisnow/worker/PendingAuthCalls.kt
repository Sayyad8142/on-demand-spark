package app.didisnow.worker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Small durable queue for background calls that could not run because the
 * worker's login was temporarily unavailable. Flushed after a successful
 * login (heartbeat with a fresh session). Bounded by BackgroundAuthRules.
 * Bodies never contain tokens.
 */
object PendingAuthCalls {
    private const val PREFS = "pending_auth_calls"
    private const val KEY = "queue"
    private val lock = Any()

    fun enqueue(ctx: Context, endpoint: String, body: JSONObject, dedupKey: String) {
        synchronized(lock) {
            val arr = read(ctx)
            val out = JSONArray()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                if (o.optString("key") != dedupKey) out.put(o)
            }
            out.put(JSONObject().apply {
                put("key", dedupKey); put("endpoint", endpoint); put("body", body)
                put("created", System.currentTimeMillis()); put("attempts", 0)
            })
            val start = maxOf(0, out.length() - BackgroundAuthRules.PENDING_MAX_ENTRIES)
            val trimmed = JSONArray()
            for (i in start until out.length()) trimmed.put(out.get(i))
            write(ctx, trimmed)
        }
    }

    /** Sends queued calls with the current login; keeps only retryable ones. */
    fun flush(ctx: Context) {
        val items = synchronized(lock) { read(ctx).also { write(ctx, JSONArray()) } }
        if (items.length() == 0) return
        val keep = JSONArray()
        val now = System.currentTimeMillis()
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val attempts = o.optInt("attempts", 0)
            if (!BackgroundAuthRules.keepPending(now, o.optLong("created", 0L), attempts)) continue
            val body = o.optJSONObject("body") ?: continue
            when (BackendSync.authedPost(ctx, o.optString("endpoint"), body)) {
                BackgroundAuthRules.Outcome.OK, BackgroundAuthRules.Outcome.DROP -> {}
                else -> keep.put(o.put("attempts", attempts + 1))
            }
        }
        WorkerLog.add(ctx, "AUTHQ", "flushed ${items.length()} kept ${keep.length()}")
        if (keep.length() > 0) synchronized(lock) {
            val cur = read(ctx)
            for (i in 0 until cur.length()) keep.put(cur.get(i))
            write(ctx, keep)
        }
    }

    private fun read(ctx: Context): JSONArray = try {
        JSONArray(ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"))
    } catch (_: Exception) { JSONArray() }

    private fun write(ctx: Context, arr: JSONArray) {
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }
}
