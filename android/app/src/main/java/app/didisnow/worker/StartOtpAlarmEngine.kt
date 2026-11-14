package app.didisnow.worker

import android.app.*
import android.content.*
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.*
import java.net.*
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors

/** One durable, account-scoped reminder queue. All network work is serialized and read-only. */
object StartOtpAlarmEngine {
    const val CHANNEL = "start_otp_alarm_v2"
    const val NOTIFICATION = 81420
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var reading = false
    private var readAgain = false
    private fun prefs(c: Context) = c.getSharedPreferences("start_otp_alarm_v2", Context.MODE_PRIVATE)
    private fun rows(c: Context) = try { JSONArray(prefs(c).getString("rows", "[]")) } catch (_: Exception) { JSONArray() }
    private fun time(s: String): Long = try {
        val normalized = s.replace(Regex("\\.(\\d{3})\\d+"), ".$1").replace(Regex("([+-]\\d{2}):(\\d{2})$"), "$1$2")
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).parse(normalized.replace("Z", "+0000"))?.time
            ?: 0L
    } catch (_: Exception) {
        try { SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssX", Locale.US).parse(s)?.time ?: 0L } catch (_: Exception) { 0L }
    }
    fun serverNow(c: Context): Long {
        val p = prefs(c)
        val elapsed = SystemClock.elapsedRealtime() - p.getLong("elapsed", -1)
        return if (elapsed >= 0 && p.getLong("server", 0) > 0) p.getLong("server", 0) + elapsed else 0L
    }
    @Synchronized fun configure(c: Context, user: String, generation: Long) {
        val p = prefs(c)
        if (p.getString("user", "") != user) stopAll(c)
        p.edit().putString("user", user).putLong("generation", generation).apply()
    }
    @Synchronized fun stopAll(c: Context) {
        prefs(c).edit().clear().commit()
        cancelTimer(c)
        main.post { StartOtpAlarmService.active?.silenceImmediately() }
        c.stopService(Intent(c, StartOtpAlarmService::class.java))
        NotificationManagerCompat.from(c).cancel(NOTIFICATION)
    }
    @Synchronized fun cancel(c: Context, id: String) {
        val out = JSONArray()
        val old = rows(c)
        for (i in 0 until old.length()) if (old.getJSONObject(i).optString("id") != id) out.put(old.getJSONObject(i))
        val stopped = prefs(c).getStringSet("stopped", emptySet())?.toMutableSet() ?: mutableSetOf()
        stopped.add(id)
        prefs(c).edit().putString("rows", out.toString()).putStringSet("stopped", stopped).apply()
        main.post { StartOtpAlarmService.active?.stopBooking(id); evaluate(c, false) }
    }
    /** A lifecycle wakeup only; server time and identity are re-read here. */
    fun sync(c: Context, user: String, generation: Long) {
        if (prefs(c).getString("user", "") != user || prefs(c).getLong("generation", -1) != generation) return
        reconcile(c, false)
    }
    private fun read(c: Context, path: String): Pair<String, Long> {
        val config = JSONObject(c.getSharedPreferences("start_otp_alarm_v2", Context.MODE_PRIVATE).getString("config", "{}") ?: "{}")
        val cap = c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val session = JSONObject(cap.getString("didi_session", null) ?: cap.getString("didi-worker-session", "{}") ?: "{}")
        val jwt = session.optString("access_token").ifBlank { session.optString("accessToken") }
        if (jwt.isBlank()) throw IllegalStateException("No session")
        val base = config.optString("url")
        if (base != "https://paywwbuqycovjopryele.supabase.co") throw IllegalStateException("Invalid host")
        val connection = URL(base + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000; connection.readTimeout = 5000
            connection.setRequestProperty("apikey", config.optString("key"))
            connection.setRequestProperty("Authorization", "Bearer $jwt")
            if (connection.responseCode !in 200..299) throw IllegalStateException("Read unavailable")
            return connection.inputStream.bufferedReader().use { it.readText() } to connection.getHeaderFieldDate("Date", 0)
        } finally { connection.disconnect() }
    }
    fun setConfig(c: Context, url: String, key: String) {
        prefs(c).edit().putString("config", JSONObject().put("url", url).put("key", key).toString()).apply()
    }
    fun reconcile(c: Context, restoring: Boolean) {
        val user = prefs(c).getString("user", "") ?: ""
        val generation = prefs(c).getLong("generation", -1)
        if (user.isBlank()) return
        synchronized(this) {
            if (reading) { readAgain = true; return }
            reading = true
        }
        executor.execute {
            var fresh = false
            try {
                val auth = JSONObject(read(c, "/auth/v1/user").first)
                if (auth.optString("id") != user) {
                    main.post { if (prefs(c).getString("user", "") == user && prefs(c).getLong("generation", -1) == generation) stopAll(c) }
                    return@execute
                }
                val workers = JSONArray(read(c, "/rest/v1/workers?select=id&user_id=eq.${URLEncoder.encode(user,"UTF-8")}&limit=2").first)
                if (workers.length() != 1) throw IllegalStateException("Worker unavailable")
                val worker = workers.getJSONObject(0).getString("id")
                val result = read(c, "/rest/v1/bookings?select=id,status,worker_id,start_otp_required,started_at,accepted_at&worker_id=eq.${URLEncoder.encode(worker,"UTF-8")}&status=in.(assigned,accepted,on_the_way)&limit=100")
                val data = JSONArray(result.first)
                val out = JSONArray()
                for (i in 0 until data.length()) {
                    val b = data.getJSONObject(i)
                    val started = !b.isNull("started_at") && b.optString("started_at").isNotBlank()
                    val accepted = time(b.optString("accepted_at"))
                    if (accepted > 0 && !prefs(c).getStringSet("stopped", emptySet()).orEmpty().contains(b.optString("id")) && StartOtpAlarmRules.eligible(b.optString("status"), b.optBoolean("start_otp_required"), started, b.optString("worker_id"), worker)) {
                        b.put("acceptedMs", accepted); out.put(b)
                    }
                }
                synchronized(this) {
                    if (prefs(c).getString("user", "") != user || prefs(c).getLong("generation", -1) != generation) return@execute
                    if (result.second <= 0) throw IllegalStateException("Missing server clock")
                    val safe = JSONArray()
                    val stopped = prefs(c).getStringSet("stopped", emptySet()).orEmpty()
                    for (i in 0 until out.length()) if (!stopped.contains(out.getJSONObject(i).optString("id"))) safe.put(out.getJSONObject(i))
                    prefs(c).edit().putString("rows", safe.toString()).putLong("server", result.second).putLong("elapsed", SystemClock.elapsedRealtime()).apply()
                    fresh = true
                }
            } catch (_: Exception) { /* retain known eligibility, never restore blindly */ }
            finally {
                synchronized(this) {
                    reading = false
                    if (readAgain) { readAgain = false; main.post { reconcile(c, false) } }
                }
            }
            main.post { if (prefs(c).getString("user", "") == user && prefs(c).getLong("generation", -1) == generation) evaluate(c, restoring && !fresh) }
        }
    }
    private fun timer(c: Context): PendingIntent = PendingIntent.getBroadcast(c, 81421, Intent(c, StartOtpAlarmReceiver::class.java).setAction("TIMER"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun cancelTimer(c: Context) { (c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(timer(c)) }
    private fun arm(c: Context, delay: Long) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val at = SystemClock.elapsedRealtime() + delay.coerceAtLeast(1000)
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, timer(c))
        else am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, timer(c))
    }
    @Synchronized fun evaluate(c: Context, blockedRestore: Boolean) {
        val now = serverNow(c)
        if (blockedRestore || now <= 0) { fallback(c); return }
        val data = rows(c)
        var selected: JSONObject? = null
        for (i in 0 until data.length()) {
            val b = data.getJSONObject(i)
            if (selected == null || b.optLong("acceptedMs") < selected.optLong("acceptedMs")) selected = b
        }
        if (selected == null) { cancelTimer(c); StartOtpAlarmService.active?.silenceImmediately(); c.stopService(Intent(c, StartOtpAlarmService::class.java)); NotificationManagerCompat.from(c).cancel(NOTIFICATION); return }
        val b = selected
        StartOtpAlarmService.active?.stopIfDifferent(b.optString("id"))
        val phase = StartOtpAlarmRules.phase(b.optLong("acceptedMs"), now)
        if (prefs(c).getLong("silenceUntil", 0) > now) { arm(c, prefs(c).getLong("silenceUntil",0)-now); return }
        val marker = "${b.optString("id")}:${b.optLong("acceptedMs")}:$phase"
        if (phase > 0 && (phase == 3 || prefs(c).getString("played", "") != marker)) {
            // Never catch up finite clips more than 90 seconds late.
            val late = now - b.optLong("acceptedMs") - (if (phase == 1) 600000 else if (phase == 2) 900000 else 1200000)
            if (phase == 3 || late <= 90000) {
                try {
                    if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) { fallback(c); return }
                    val intent = Intent(c, StartOtpAlarmService::class.java).putExtra("booking", b.optString("id")).putExtra("loop", phase == 3)
                    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(intent) else c.startService(intent)
                    prefs(c).edit().putString("played", marker).apply()
                } catch (_: Exception) { fallback(c) }
            }
        }
        if (phase < 3) arm(c, StartOtpAlarmRules.nextAt(b.optLong("acceptedMs"), now)-now) else cancelTimer(c)
    }
    fun silence(c: Context) {
        prefs(c).edit().putLong("silenceUntil", serverNow(c) + 300000L).apply()
        StartOtpAlarmService.active?.silenceImmediately()
        c.stopService(Intent(c, StartOtpAlarmService::class.java))
        arm(c, 300000)
    }
    fun channel(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL, "Start OTP alarm", NotificationManager.IMPORTANCE_HIGH)
            channel.setSound(null, null)
            (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }
    fun notification(c: Context): Notification {
        channel(c)
        val open = PendingIntent.getActivity(c, 81422, Intent(c, MainActivity::class.java).putExtra("navigate_to", "bookings"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val pause = PendingIntent.getBroadcast(c, 81423, Intent(c, StartOtpAlarmReceiver::class.java).setAction("SILENCE"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(c, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Start OTP Pending").setContentText("Enter OTP to stop reminder.")
            .setContentIntent(open).setOngoing(true).addAction(0, "Silence 5 minutes", pause).build()
    }
    fun fallback(c: Context) { try { NotificationManagerCompat.from(c).notify(NOTIFICATION, notification(c)) } catch (_: Exception) {} }
    fun boot(c: Context) {
        // elapsedRealtime is from another boot; never use it to restore stale eligibility.
        prefs(c).edit().remove("server").remove("elapsed").apply()
        cancelTimer(c)
        if (rows(c).length() > 0) fallback(c)
    }
}
