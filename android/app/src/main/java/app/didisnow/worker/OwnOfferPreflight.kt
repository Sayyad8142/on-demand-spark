package app.didisnow.worker

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant

/** Read-only, using the worker JWT throughout. Never trusts a phone-supplied worker id. */
object OwnOfferPreflight {
    fun deadline(base: String, apiKey: String, jwt: String, bookingId: String, requestId: String? = null): Long {
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
        if (OfferAcceptanceContract.FAVORITE_V1_STATUS_ENABLED) return favoriteV1(base, apiKey, jwt, bookingId, requestId)
        val workers = JSONArray(read("/rest/v1/workers?select=id&user_id=eq.${encoded(userId)}&limit=2"))
        if (workers.length() != 1) throw IllegalStateException("not-offered")
        val workerId = workers.getJSONObject(0).optString("id")
        if (workerId.isBlank()) throw IllegalStateException("not-offered")
        val requestFilter = requestId?.takeIf { it.isNotBlank() }?.let { "&id=eq.${encoded(it)}" } ?: ""
        val offers = JSONArray(read("/rest/v1/booking_requests?select=status,timeout_at&booking_id=eq.${encoded(bookingId)}&worker_id=eq.${encoded(workerId)}$requestFilter&limit=2"))
        if (offers.length() != 1) throw IllegalStateException("not-offered")
        val offer = offers.getJSONObject(0)
        val status = offer.optString("status")
        if (status !in setOf("pending", "sent", "queued")) throw IllegalStateException("not-offered")
        val at = try { Instant.parse(offer.optString("timeout_at")).epochSecond }
            catch (_: Exception) { throw IllegalStateException("Unable to check offer. Please retry.") }
        if (!OfferAcceptRules.active(status, at, System.currentTimeMillis() / 1000)) throw IllegalStateException("offer-expired")
        return at
    }

    /** favorite-v1 status read: only the booking id is sent; identity comes from the JWT. No legacy fallback. */
    private fun favoriteV1(base: String, apiKey: String, jwt: String, bookingId: String, requestId: String?): Long {
        val connection = URL("$base/rest/v1/rpc/${OfferAcceptanceContract.STATUS_RPC}").openConnection() as HttpURLConnection
        val body = try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 4000
            connection.readTimeout = 4000
            connection.doOutput = true
            connection.setRequestProperty("apikey", apiKey)
            connection.setRequestProperty("Authorization", "Bearer $jwt")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(JSONObject().put("p_booking_id", bookingId).toString().toByteArray()) }
            val code = connection.responseCode
            if (code == 401 || code == 403) throw IllegalStateException("Session expired. Please log in again.")
            if (code !in 200..299) throw IllegalStateException("Network problem checking offer")
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally { connection.disconnect() }
        val json = try { JSONObject(body) } catch (_: Exception) { throw IllegalStateException("Unable to check offer. Please retry.") }
        fun epoch(key: String) = try { Instant.parse(json.optString(key)).epochSecond } catch (_: Exception) { 0L }
        val actionable = if (json.opt("actionable") is Boolean) json.getBoolean("actionable") else null
        val rawGeneration = json.opt("offer_generation")
        if (rawGeneration != JSONObject.NULL && OfferAcceptanceContract.uuidOrNull(rawGeneration) == null) throw IllegalStateException("not-offered")
        val generation = OfferAcceptanceContract.uuidOrNull(rawGeneration)
        if (!json.has("favorite_state")) throw IllegalStateException("not-offered")
        val favoriteState = if (json.isNull("favorite_state")) null else json.opt("favorite_state") as? String
            ?: throw IllegalStateException("not-offered")
        if (json.has("offer_id") && json.opt("offer_id") != json.opt("request_id")) throw IllegalStateException("not-offered")
        val deadline = OfferAcceptanceContract.favoriteDeadline(
            json.optString("contract_version"), json.optString("booking_id"), bookingId,
            json.optString("request_id"), requestId, generation, json.optString("status"), favoriteState, json.optString("offer_state"), actionable,
            epoch("expires_at"), epoch("server_time"), System.currentTimeMillis() / 1000)
        if (deadline <= 0) throw IllegalStateException(if (actionable == false) "offer-expired" else "not-offered")
        return deadline
    }
}
