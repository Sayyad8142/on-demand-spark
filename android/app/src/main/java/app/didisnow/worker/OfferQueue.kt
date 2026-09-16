package app.didisnow.worker

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * FIFO booking-offer queue.
 *
 * ONE visible offer at a time + a persisted FIFO queue behind it.
 *
 * - Every actionable BOOKING_ALERT (native FCM path, JS/Capacitor path, polling
 *   fallback path) is enqueued here first, deduplicated by the authoritative
 *   offer identity (booking_request_id, falling back to booking_id).
 * - The overlay shows the head of the queue; additional offers wait.
 * - On accept / reject / expiry / dismissal the overlay drains the queue and
 *   shows the next STILL-VALID offer immediately.
 * - Offers are persisted in SharedPreferences so a recreated process can
 *   recover still-valid offers. Access tokens are never persisted here.
 *
 * This queue is a delivery/presentation mechanism only. Backend acceptance
 * (accept_booking_authoritative) remains the single source of truth.
 */
object OfferQueue {
    private const val TAG = "OfferQueue"
    private const val PREFS = "booking_offer_queue"
    private const val KEY_QUEUE = "queue_v1"
    private const val KEY_ACTIVE = "active_key"
    private const val KEY_BUSY_UNTIL = "local_busy_until_ms"
    private const val KEY_TAKEN = "taken_bookings_v1"
    private const val KEY_ACCEPTING_ID = "accepting_booking_id"
    private const val KEY_ACCEPTING_AT = "accepting_started_at"
    private const val KEY_ACCEPTED_ID = "accepted_booking_id"
    private const val KEY_ACCEPTED_AT = "accepted_at"

    /** How long one acceptance attempt may hold the single-flight claim. */
    private const val ACCEPT_CLAIM_TTL_MS = 20_000L

    /** How long a booking stays remembered as "taken by another worker". */
    private const val TAKEN_TTL_MS = 30 * 60 * 1000L

    /** Local busy suppression window after a confirmed acceptance. */
    private const val BUSY_WINDOW_MS = 10 * 60 * 1000L

    /** Hard cap so a broken backend can never grow prefs unbounded. */
    private const val MAX_ENTRIES = 20

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ---------------------------------------------------------------- identity

    fun keyOf(offer: JSONObject): String {
        val req = offer.optString("booking_request_id", "")
        if (req.isNotBlank()) return "req:$req"
        return "bkg:${offer.optString("booking_id", "")}"
    }

    fun bookingIdOf(offer: JSONObject): String = offer.optString("booking_id", "")

    fun notificationIdFor(bookingId: String?): Int =
        if (bookingId.isNullOrEmpty()) 12345 else bookingId.hashCode()

    // ------------------------------------------------------------- conversions

    /** Builds a persistable offer record from an incoming service/activity Intent. */
    fun offerFromIntent(intent: Intent?): JSONObject? {
        if (intent == null) return null
        val bookingId = intent.getStringExtra("booking_id") ?: return null
        if (bookingId.isBlank()) return null
        return JSONObject().apply {
            put("booking_id", bookingId)
            put("booking_request_id", intent.getStringExtra("booking_request_id") ?: "")
            put("booking_type", intent.getStringExtra("booking_type") ?: "instant")
            put("customer_name", intent.getStringExtra("customer_name") ?: "New Customer")
            put("community", intent.getStringExtra("community") ?: "")
            put("service_type", intent.getStringExtra("service_type") ?: "")
            put("flat_no", intent.getStringExtra("flat_no") ?: "")
            put("building_name", intent.getStringExtra("building_name") ?: "")
            put("price_inr", intent.getIntExtra("price_inr", 0))
            put("scheduled_time", intent.getStringExtra("scheduled_time") ?: "")
            put("prealert_sent", intent.getBooleanExtra("prealert_sent", false))
            put("expires_at", intent.getLongExtra("expires_at", 0L))
            put("sent_at", intent.getLongExtra("sent_at", 0L))
            put("ttl_seconds", intent.getIntExtra("ttl_seconds", OfferTimer.DEFAULT_TTL_SECONDS))
            put("queued_at_sec", System.currentTimeMillis() / 1000)
        }
    }

    /** Rebuilds a "show" Intent for the overlay service from a queued offer. */
    fun toServiceIntent(ctx: Context, offer: JSONObject): Intent =
        applyExtras(Intent(ctx, BookingOverlayService::class.java), offer)

    /** Rebuilds a full-screen fallback Activity Intent from a queued offer. */
    fun toActivityIntent(ctx: Context, offer: JSONObject): Intent =
        applyExtras(Intent(ctx, BookingAlertActivity::class.java), offer).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

    private fun applyExtras(intent: Intent, offer: JSONObject): Intent = intent.apply {
        putExtra("mode", "show")
        putExtra("actionable", "true")
        putExtra("booking_id", offer.optString("booking_id"))
        offer.optString("booking_request_id").takeIf { it.isNotBlank() }
            ?.let { putExtra("booking_request_id", it) }
        putExtra("booking_type", offer.optString("booking_type", "instant"))
        putExtra("customer_name", offer.optString("customer_name", "New Customer"))
        putExtra("community", offer.optString("community"))
        putExtra("service_type", offer.optString("service_type"))
        putExtra("flat_no", offer.optString("flat_no"))
        putExtra("building_name", offer.optString("building_name"))
        putExtra("price_inr", offer.optInt("price_inr", 0))
        putExtra("scheduled_time", offer.optString("scheduled_time"))
        putExtra("prealert_sent", offer.optBoolean("prealert_sent", false))
        putExtra("expires_at", offer.optLong("expires_at", 0L))
        putExtra("sent_at", offer.optLong("sent_at", 0L))
        putExtra("ttl_seconds", offer.optInt("ttl_seconds", OfferTimer.DEFAULT_TTL_SECONDS))
        putExtra("from_queue", true)
    }

    // ------------------------------------------------------------------ expiry

    /** True when the offer's ORIGINAL backend expiry has already passed. */
    fun isExpired(offer: JSONObject): Boolean {
        val now = System.currentTimeMillis() / 1000
        val expiresAt = offer.optLong("expires_at", 0L)
        val sentAt = offer.optLong("sent_at", 0L)
        val ttl = offer.optInt("ttl_seconds", OfferTimer.DEFAULT_TTL_SECONDS)
            .takeIf { it in 1..600 } ?: OfferTimer.DEFAULT_TTL_SECONDS
        return when {
            expiresAt > 0L -> now >= expiresAt
            sentAt > 0L -> now >= sentAt + ttl
            else -> now >= offer.optLong("queued_at_sec", now) + ttl
        }
    }

    // ------------------------------------------------------------------- state

    @Synchronized
    private fun read(ctx: Context): MutableList<JSONObject> {
        val raw = prefs(ctx).getString(KEY_QUEUE, "[]") ?: "[]"
        val out = mutableListOf<JSONObject>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { out.add(it) }
        } catch (e: Exception) {
            Log.e(TAG, "queue parse failed, resetting", e)
        }
        return out
    }

    @Synchronized
    private fun write(ctx: Context, items: List<JSONObject>) {
        val arr = JSONArray()
        items.takeLast(MAX_ENTRIES).forEach { arr.put(it) }
        prefs(ctx).edit().putString(KEY_QUEUE, arr.toString()).apply()
    }

    // ------------------------------------------------- taken (already assigned)

    /**
     * Bookings that the backend has already assigned to somebody else.
     *
     * Recorded so a delayed FCM/tray/queue replay can never reopen a fresh
     * 60s popup for a booking that is gone. Purely local UX bookkeeping —
     * backend acceptance remains the single source of truth.
     */
    @Synchronized
    fun markTaken(ctx: Context, bookingId: String?) {
        if (bookingId.isNullOrBlank()) return
        // NEVER mark a booking this device is accepting / has just accepted as
        // "taken by another worker" — that is our own assignment.
        if (isAcceptInFlight(ctx, bookingId) || isAcceptedByMe(ctx, bookingId)) {
            Log.d(TAG, "🛡️ ignoring markTaken for own acceptance booking_id=$bookingId")
            return
        }
        val map = readTaken(ctx)
        map.put(bookingId, System.currentTimeMillis())
        writeTaken(ctx, map)
        Log.d(TAG, "🚫 booking marked taken booking_id=$bookingId")
    }

    @Synchronized
    fun isTaken(ctx: Context, bookingId: String?): Boolean {
        if (bookingId.isNullOrBlank()) return false
        val ts = readTaken(ctx).optLong(bookingId, 0L)
        return ts > 0L && System.currentTimeMillis() - ts < TAKEN_TTL_MS
    }

    private fun readTaken(ctx: Context): JSONObject {
        val raw = prefs(ctx).getString(KEY_TAKEN, "{}") ?: "{}"
        return try { JSONObject(raw) } catch (e: Exception) { JSONObject() }
    }

    private fun writeTaken(ctx: Context, map: JSONObject) {
        // Drop expired entries so prefs can never grow unbounded.
        val now = System.currentTimeMillis()
        val cleaned = JSONObject()
        val keys = map.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val ts = map.optLong(k, 0L)
            if (now - ts < TAKEN_TTL_MS) cleaned.put(k, ts)
        }
        prefs(ctx).edit().putString(KEY_TAKEN, cleaned.toString()).apply()
    }

    // -------------------------------------------------- acceptance single-flight

    /**
     * Process-wide acceptance claim.
     *
     * Only ONE acceptance attempt per booking may run on this device, no matter
     * which surface started it (overlay service, full-screen activity, web UI).
     * Persisted so the claim survives a service/activity recreation.
     * Backend acceptance remains the single source of truth — this only stops
     * duplicate requests and stops competing callbacks (2s poller, realtime,
     * countdown, queue drain) from treating our own accept as a loss.
     */
    @Synchronized
    fun beginAcceptance(ctx: Context, bookingId: String?): Boolean {
        if (bookingId.isNullOrBlank()) return false
        if (isAcceptInFlight(ctx, bookingId)) {
            Log.d(TAG, "↩️ acceptance already in flight booking_id=$bookingId")
            return false
        }
        prefs(ctx).edit()
            .putString(KEY_ACCEPTING_ID, bookingId)
            .putLong(KEY_ACCEPTING_AT, System.currentTimeMillis())
            .apply()
        Log.d(TAG, "🔐 acceptance claimed booking_id=$bookingId")
        return true
    }

    @Synchronized
    fun isAcceptInFlight(ctx: Context, bookingId: String?): Boolean {
        val id = prefs(ctx).getString(KEY_ACCEPTING_ID, null) ?: return false
        val at = prefs(ctx).getLong(KEY_ACCEPTING_AT, 0L)
        if (System.currentTimeMillis() - at > ACCEPT_CLAIM_TTL_MS) return false
        return bookingId.isNullOrBlank() || id == bookingId
    }

    /** Releases the claim (failed accept, or after the result is handled). */
    @Synchronized
    fun endAcceptance(ctx: Context, bookingId: String?) {
        val id = prefs(ctx).getString(KEY_ACCEPTING_ID, null)
        if (id != null && (bookingId.isNullOrBlank() || id == bookingId)) {
            prefs(ctx).edit().remove(KEY_ACCEPTING_ID).remove(KEY_ACCEPTING_AT).apply()
            Log.d(TAG, "🔓 acceptance claim released booking_id=$id")
        }
    }

    /** Backend confirmed WE won this booking. */
    @Synchronized
    fun markAcceptedByMe(ctx: Context, bookingId: String?) {
        if (bookingId.isNullOrBlank()) return
        prefs(ctx).edit()
            .putString(KEY_ACCEPTED_ID, bookingId)
            .putLong(KEY_ACCEPTED_AT, System.currentTimeMillis())
            .apply()
        Log.d(TAG, "🏆 acceptance confirmed for this device booking_id=$bookingId")
    }

    @Synchronized
    fun isAcceptedByMe(ctx: Context, bookingId: String?): Boolean {
        if (bookingId.isNullOrBlank()) return false
        val id = prefs(ctx).getString(KEY_ACCEPTED_ID, null) ?: return false
        val at = prefs(ctx).getLong(KEY_ACCEPTED_AT, 0L)
        return id == bookingId && System.currentTimeMillis() - at < BUSY_WINDOW_MS
    }

    /** Adds an offer if not already queued. Returns true when newly added. */
    @Synchronized
    fun enqueue(ctx: Context, offer: JSONObject): Boolean {
        val key = keyOf(offer)
        val bookingId = bookingIdOf(offer)
        if (isTaken(ctx, bookingId)) {
            Log.d(TAG, "🚫 offer not queued — booking already assigned elsewhere: $bookingId")
            cancelNotification(ctx, bookingId)
            return false
        }
        val items = read(ctx)
        val duplicate = items.any {
            keyOf(it) == key || (bookingId.isNotBlank() && bookingIdOf(it) == bookingId)
        }
        if (duplicate) {
            Log.d(TAG, "↩️ duplicate offer ignored key=$key booking_id=$bookingId")
            return false
        }
        items.add(offer)
        write(ctx, items)
        Log.d(TAG, "➕ queued offer key=$key booking_id=$bookingId size=${items.size}")
        return true
    }

    @Synchronized
    fun contains(ctx: Context, bookingId: String): Boolean =
        read(ctx).any { bookingIdOf(it) == bookingId }

    @Synchronized
    fun remove(ctx: Context, bookingId: String?, requestId: String? = null) {
        if (bookingId.isNullOrBlank() && requestId.isNullOrBlank()) return
        val items = read(ctx)
        val kept = items.filterNot {
            (!bookingId.isNullOrBlank() && bookingIdOf(it) == bookingId) ||
                (!requestId.isNullOrBlank() && it.optString("booking_request_id") == requestId)
        }
        if (kept.size != items.size) {
            write(ctx, kept)
            Log.d(TAG, "➖ removed offer booking_id=$bookingId remaining=${kept.size}")
        }
    }

    @Synchronized
    fun find(ctx: Context, bookingId: String): JSONObject? =
        read(ctx).firstOrNull { bookingIdOf(it) == bookingId }

    /** The offer currently displayed (kept in the queue for crash recovery). */
    @Synchronized
    fun setActive(ctx: Context, offer: JSONObject?) {
        prefs(ctx).edit().apply {
            if (offer == null) remove(KEY_ACTIVE) else putString(KEY_ACTIVE, keyOf(offer))
        }.apply()
    }

    /**
     * Pops the next still-valid offer, discarding expired ones on the way.
     * Expired offers get a queue-specific failure ack so telemetry stays honest.
     */
    @Synchronized
    fun nextValid(ctx: Context): JSONObject? {
        val activeKey = prefs(ctx).getString(KEY_ACTIVE, null)
        val items = read(ctx)
        var chosen: JSONObject? = null
        val kept = mutableListOf<JSONObject>()
        for (offer in items) {
            if (chosen != null) { kept.add(offer); continue }
            if (activeKey != null && keyOf(offer) == activeKey) continue // finished offer
            if (isTaken(ctx, bookingIdOf(offer))) {
                Log.d(TAG, "🚫 discarding queued offer assigned elsewhere booking_id=${bookingIdOf(offer)}")
                cancelNotification(ctx, bookingIdOf(offer))
                continue
            }
            if (isExpired(offer)) {
                Log.d(TAG, "🗑️ discarding expired queued offer booking_id=${bookingIdOf(offer)}")
                BackendSync.ackFailureAsync(
                    ctx.applicationContext,
                    bookingIdOf(offer),
                    "offer_queued_expired",
                    offer.optString("booking_request_id").takeIf { it.isNotBlank() },
                )
                cancelNotification(ctx, bookingIdOf(offer))
                continue
            }
            chosen = offer
            kept.add(offer)
        }
        write(ctx, kept)
        prefs(ctx).edit().remove(KEY_ACTIVE).apply()
        if (chosen != null) Log.d(TAG, "⏭️ next valid offer booking_id=${bookingIdOf(chosen)}")
        return chosen
    }

    /** Clears every queued offer and cancels their tray notifications. */
    @Synchronized
    fun clearAll(ctx: Context, reason: String) {
        val items = read(ctx)
        items.forEach { cancelNotification(ctx, bookingIdOf(it)) }
        prefs(ctx).edit().remove(KEY_QUEUE).remove(KEY_ACTIVE).apply()
        if (items.isNotEmpty()) Log.d(TAG, "🧹 cleared ${items.size} queued offers ($reason)")
    }

    // -------------------------------------------------------------- busy state

    fun markLocallyBusy(ctx: Context) {
        prefs(ctx).edit().putLong(KEY_BUSY_UNTIL, System.currentTimeMillis() + BUSY_WINDOW_MS).apply()
        Log.d(TAG, "🔒 worker marked locally busy")
    }

    fun clearLocallyBusy(ctx: Context) {
        prefs(ctx).edit().remove(KEY_BUSY_UNTIL).apply()
    }

    fun isLocallyBusy(ctx: Context): Boolean =
        prefs(ctx).getLong(KEY_BUSY_UNTIL, 0L) > System.currentTimeMillis()

    // ----------------------------------------------------------- notifications

    fun cancelNotification(ctx: Context, bookingId: String?) {
        if (bookingId.isNullOrBlank()) return
        try {
            val nm = ctx.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.cancel(notificationIdFor(bookingId))
            Log.d(TAG, "🔕 cancelled tray notification for booking_id=$bookingId")
        } catch (e: Exception) {
            Log.w(TAG, "cancelNotification failed", e)
        }
    }
}
