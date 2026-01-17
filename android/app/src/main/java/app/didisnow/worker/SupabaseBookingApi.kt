package app.didisnow.worker

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal Supabase RPC client for background/native flows (overlay).
 * Uses the user's Supabase JWT stored by AuthBridge in SharedPreferences.
 *
 * NOTE: The anon key is publishable and safe to ship in the client.
 */
object SupabaseBookingApi {
  private const val TAG = "SupabaseBookingApi"

  private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
  private const val SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"

  private const val WORKER_PREFS = "worker_prefs"
  private const val JWT_KEY = "supabase_jwt"

  fun tryAcceptBookingAsync(
    context: Context,
    bookingId: String,
    onResult: (success: Boolean, error: String?) -> Unit
  ) {
    Thread {
      val result = try {
        tryAcceptBookingBlocking(context, bookingId)
      } catch (e: Exception) {
        Log.e(TAG, "❌ tryAcceptBookingBlocking crashed", e)
        Pair(false, e.message ?: "Unexpected error")
      }

      Handler(Looper.getMainLooper()).post {
        onResult(result.first, result.second)
      }
    }.start()
  }

  private fun tryAcceptBookingBlocking(context: Context, bookingId: String): Pair<Boolean, String?> {
    val prefs = context.getSharedPreferences(WORKER_PREFS, Context.MODE_PRIVATE)
    val jwt = prefs.getString(JWT_KEY, null)

    if (jwt.isNullOrBlank()) {
      return Pair(false, "No session token found. Please open the app and login once.")
    }

    val url = URL("$SUPABASE_URL/rest/v1/rpc/try_accept_booking")
    val conn = (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 8000
      readTimeout = 8000
      doOutput = true
      setRequestProperty("apikey", SUPABASE_ANON_KEY)
      setRequestProperty("Authorization", "Bearer $jwt")
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Accept", "application/json")
    }

    val body = JSONObject().put("p_booking_id", bookingId).toString()

    OutputStreamWriter(conn.outputStream).use { it.write(body) }

    val status = conn.responseCode
    val stream = if (status in 200..299) conn.inputStream else conn.errorStream
    val raw = try {
      BufferedReader(InputStreamReader(stream)).use { it.readText() }
    } catch (_: Exception) {
      ""
    }

    Log.d(TAG, "RPC try_accept_booking status=$status body=${raw.take(200)}")

    if (status !in 200..299) {
      return Pair(false, "HTTP $status")
    }

    // Supabase RPC returns a JSON object (or sometimes 'null')
    val trimmed = raw.trim()
    if (trimmed.isEmpty() || trimmed == "null") {
      return Pair(false, "Empty response")
    }

    val json = try {
      JSONObject(trimmed)
    } catch (_: Exception) {
      return Pair(false, "Invalid response")
    }

    val success = json.optBoolean("success", false)
    val err = json.optString("error", null)

    return Pair(success, if (success) null else (err ?: "Failed to accept"))
  }
}
