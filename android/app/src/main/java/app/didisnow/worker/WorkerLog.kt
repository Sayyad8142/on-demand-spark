package app.didisnow.worker

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Tagged ring-buffer logger persisted to SharedPreferences so the AuthDebug
 * screen can surface the last ~200 events even after process death / reboot.
 *
 * Tags: BOOT, FCM, TOKEN, BACKEND, SVC.
 */
object WorkerLog {
    private const val PREFS = "worker_logs"
    private const val KEY = "events"
    private const val MAX_ENTRIES = 200
    private val DATE_FMT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)

    @Synchronized
    fun add(ctx: Context, tag: String, message: String) {
        Log.d("WorkerLog", "[$tag] $message")
        try {
            val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY, "[]") ?: "[]"
            val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }

            val entry = JSONObject().apply {
                put("t", DATE_FMT.format(Date()))
                put("tag", tag)
                put("msg", message)
            }
            arr.put(entry)

            // Trim to MAX_ENTRIES
            val start = (arr.length() - MAX_ENTRIES).coerceAtLeast(0)
            val trimmed = if (start == 0) arr else {
                val out = JSONArray()
                for (i in start until arr.length()) out.put(arr.get(i))
                out
            }

            prefs.edit().putString(KEY, trimmed.toString()).apply()
        } catch (e: Exception) {
            Log.w("WorkerLog", "Failed to persist log entry: ${e.message}")
        }
    }

    fun read(ctx: Context): String {
        return ctx.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "[]") ?: "[]"
    }

    fun clear(ctx: Context) {
        ctx.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(KEY).apply()
    }
}
