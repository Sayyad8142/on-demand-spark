package app.didisnow.worker

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant

/** Read-only, using the worker JWT throughout. Never trusts a phone-supplied worker id. */
object OwnOfferPreflight {
    fun deadline(base: String, apiKey: String, jwt: String, bookingId: String): Long {
        fun read(path: String): String {
            val connection = URL("$base$path").openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "GET"
                connection.connectTimeout = 4000
                connection.readTimeout = 4000
                connection.setRequestProperty("apikey", apiKey)
                connection.setRequestProperty("Authorization", "Bearer $jwt")
                val code = connection.responseCode
                if (code == 401 || code == 403) throw IllegalStateException("Session expired. Please log in again.")
                if (code !in 200..299) throw IllegalStateException("Network problem checking offer")
                return connection.inputStream.bufferedReader().use { it.readText() }
            } finally { connection.disconnect() }
        }
        fun encoded(value: String) = URLEncoder.encode(value, "UTF-8")
        // Auth server verifies the JWT; no decode-only identity or cached-worker fallback.
        val userId = JSONObject(read("/auth/v1/user")).optString("id")
        if (userId.isBlank()) throw IllegalStateException("Session unavailable")
        val workers = JSONArray(read("/rest/v1/workers?select=id&user_id=eq.${encoded(userId)}&limit=2"))
        if (workers.length() != 1) throw IllegalStateException("not-offered")
        val workerId = workers.getJSONObject(0).optString("id")
        if (workerId.isBlank()) throw IllegalStateException("not-offered")
        val offers = JSONArray(read("/rest/v1/booking_requests?select=status,timeout_at&booking_id=eq.${encoded(bookingId)}&worker_id=eq.${encoded(workerId)}&limit=2"))
        if (offers.length() != 1) throw IllegalStateException("not-offered")
        val offer = offers.getJSONObject(0)
        val status = offer.optString("status")
        if (status !in setOf("pending", "sent", "queued")) throw IllegalStateException("not-offered")
        val at = try { Instant.parse(offer.optString("timeout_at")).epochSecond }
            catch (_: Exception) { throw IllegalStateException("Unable to check offer. Please retry.") }
        if (!OfferAcceptRules.active(status, at, System.currentTimeMillis() / 1000)) throw IllegalStateException("offer-expired")
        return at
    }
}