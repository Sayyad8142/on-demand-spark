package app.didisnow.worker

import android.content.Context
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/**
 * OTA Live Updates — "DidiLiveUpdate" (hardened).
 *
 * Every rule is enforced here; values from JS are never trusted:
 *  - URL: HTTPS, the project's public ota-bundles bucket only, no redirects.
 *  - SHA-256 and exact size are REQUIRED; download is capped.
 *  - ZIP: no path escape, entry-count and unpacked-size caps, must contain index.html.
 *  - downloadAndStage only prepares files; activateStaged switches the screen and is
 *    refused while a booking offer is showing/queued or an Accept is in flight.
 *  - A bundle that does not confirm a good start is rolled back by MainActivity and
 *    recorded in failed_versions; failed versions are never installed again.
 */
@CapacitorPlugin(name = "DidiLiveUpdate")
class LiveUpdatePlugin : Plugin() {

    companion object {
        private const val TAG = "DidiLiveUpdate"
        const val PREFS_NAME = "didi_live_update_prefs"
        const val BUNDLES_DIR = "ota_bundles"
        const val STAGING_DIR = "ota_staging"
        const val PREF_ACTIVE_PATH = "active_bundle_path"
        const val PREF_ACTIVE_VERSION = "active_bundle_version"
        const val PREF_PENDING_VERSION = "pending_bundle_version"
        const val PREF_BOOT_CONFIRMED = "boot_confirmed"
        const val PREF_STAGED_VERSION = "staged_bundle_version"
        const val PREF_STAGED_PATH = "staged_bundle_path"
        const val PREF_FAILED_VERSIONS = "failed_versions"
        const val PREF_LAST_ROLLBACK = "last_rollback_reason"

        fun isApprovedUrl(raw: String?) = OtaRules.isApprovedUrl(raw)
        fun isSafeVersion(v: String?) = OtaRules.isSafeVersion(v)
        fun isValidSha(v: String?) = OtaRules.isValidSha(v)
        private const val MAX_ZIP_BYTES = OtaRules.MAX_ZIP_BYTES
        private const val MAX_UNPACKED_BYTES = OtaRules.MAX_UNPACKED_BYTES
        private const val MAX_ENTRIES = OtaRules.MAX_ENTRIES

        fun failedVersions(ctx: Context): MutableSet<String> {
            val raw = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_FAILED_VERSIONS, "[]")
            return try {
                val arr = JSONArray(raw)
                (0 until arr.length()).map { arr.getString(it) }.toMutableSet()
            } catch (_: Exception) { mutableSetOf() }
        }

        fun addFailedVersion(ctx: Context, version: String, reason: String) {
            val set = failedVersions(ctx).apply { add(version) }
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(PREF_FAILED_VERSIONS, JSONArray(set.toList().takeLast(20)).toString())
                .putString(PREF_LAST_ROLLBACK, "$version:$reason")
                .apply()
        }
    }

    private fun prefs() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** JS: downloadAndStage({ url, version, sha256, sizeBytes }). Never reloads. */
    @PluginMethod
    fun downloadAndStage(call: PluginCall) {
        val url = call.getString("url")
        val version = call.getString("version")
        val sha = call.getString("sha256")
        val size = call.getDouble("sizeBytes")?.toLong() ?: -1L

        if (!isSafeVersion(version)) return call.resolve(errorResult("bad_version"))
        if (!isApprovedUrl(url)) return call.resolve(errorResult("bad_url"))
        if (!isValidSha(sha)) return call.resolve(errorResult("missing_sha256"))
        if (!OtaRules.isValidSize(size)) return call.resolve(errorResult("bad_size"))
        if (failedVersions(context).contains(version)) return call.resolve(errorResult("previously_failed"))

        Log.d(TAG, "📦 stage v=$version size=$size")
        CoroutineScope(Dispatchers.IO).launch {
            val stagingRoot = File(context.filesDir, STAGING_DIR)
            val target = File(stagingRoot, version!!)
            val zip = File(context.cacheDir, "ota_$version.zip")
            try {
                stagingRoot.deleteRecursively()
                target.mkdirs()
                download(url!!, zip, size)
                val actual = sha256(zip)
                if (!actual.equals(sha, ignoreCase = true)) throw SecurityException("sha256_mismatch")
                extractSafely(zip, target)
                val index = findIndexHtml(target) ?: throw SecurityException("no_index_html")
                prefs().edit()
                    .putString(PREF_STAGED_VERSION, version)
                    .putString(PREF_STAGED_PATH, index.parentFile!!.absolutePath)
                    .apply()
                call.resolve(JSObject().put("success", true))
            } catch (e: Exception) {
                target.deleteRecursively()
                val msg = when (e) {
                    is SecurityException -> e.message ?: "security"
                    is java.net.SocketTimeoutException -> "network_timeout"
                    is IOException -> e.message?.takeIf { it.startsWith("http_") || it.startsWith("size_") } ?: "network"
                    else -> "error"
                }
                Log.w(TAG, "📦 stage failed v=$version reason=$msg")
                call.resolve(errorResult(msg))
            } finally {
                zip.delete()
            }
        }
    }

    /** Switch to the staged bundle. Refused while an offer is live or an Accept is in flight. */
    @PluginMethod
    fun activateStaged(call: PluginCall) {
        val p = prefs()
        val version = p.getString(PREF_STAGED_VERSION, null)
        val stagedPath = p.getString(PREF_STAGED_PATH, null)
        if (version == null || stagedPath == null) return call.resolve(errorResult("nothing_staged"))
        if (OfferQueue.hasLiveOffer(context) || OfferQueue.isLocallyBusy(context)) {
            Log.d(TAG, "📦 activation deferred: offer live / phone busy")
            return call.resolve(errorResult("busy"))
        }
        try {
            val stagingVersionDir = File(File(context.filesDir, STAGING_DIR), version)
            val finalDir = File(File(context.filesDir, BUNDLES_DIR), version)
            finalDir.deleteRecursively()
            finalDir.parentFile?.mkdirs()
            if (!stagingVersionDir.renameTo(finalDir)) throw IOException("move_failed")
            val rel = File(stagedPath).relativeTo(stagingVersionDir).path
            val servePath = if (rel.isEmpty()) finalDir.absolutePath else File(finalDir, rel).absolutePath
            if (!File(servePath, "index.html").exists()) throw IOException("no_index_html")

            p.edit()
                .putString(PREF_ACTIVE_PATH, servePath)
                .putString(PREF_ACTIVE_VERSION, version)
                .putString(PREF_PENDING_VERSION, version)
                .putBoolean(PREF_BOOT_CONFIRMED, false)
                .remove(PREF_STAGED_VERSION)
                .remove(PREF_STAGED_PATH)
                .commit()
            cleanOldBundles(version)
            activity.runOnUiThread {
                try { bridge?.serverBasePath = servePath } catch (e: Exception) { Log.e(TAG, "📦 set path failed", e) }
            }
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            Log.w(TAG, "📦 activation failed: ${e.message}")
            call.resolve(errorResult(e.message ?: "activation_failed"))
        }
    }

    /** Called from JS after React mounted: the bundle started fine. */
    @PluginMethod
    fun confirmBoot(call: PluginCall) {
        prefs().edit()
            .remove(PREF_PENDING_VERSION)
            .remove(PREF_LAST_ROLLBACK)
            .putBoolean(PREF_BOOT_CONFIRMED, true)
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val p = prefs()
        call.resolve(JSObject().apply {
            put("activeVersion", p.getString(PREF_ACTIVE_VERSION, null))
            put("pendingVersion", p.getString(PREF_PENDING_VERSION, null))
            put("stagedVersion", p.getString(PREF_STAGED_VERSION, null))
            put("failedVersions", JSArray(failedVersions(context).toList()))
            put("lastRollbackReason", p.getString(PREF_LAST_ROLLBACK, null))
        })
    }

    /** Back to the APK's built-in bundle. Keeps the failed-version history. */
    @PluginMethod
    fun reset(call: PluginCall) {
        val failed = prefs().getString(PREF_FAILED_VERSIONS, "[]")
        prefs().edit().clear().putString(PREF_FAILED_VERSIONS, failed).apply()
        File(context.filesDir, BUNDLES_DIR).deleteRecursively()
        File(context.filesDir, STAGING_DIR).deleteRecursively()
        context.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE).edit().remove("serverBasePath").apply()
        activity.runOnUiThread {
            try { bridge?.serverBasePath = null; bridge?.reload() } catch (e: Exception) { Log.e(TAG, "📦 reset failed", e) }
        }
        call.resolve()
    }

    @PluginMethod
    fun getCurrentPath(call: PluginCall) {
        call.resolve(JSObject().put("path", prefs().getString(PREF_ACTIVE_PATH, "") ?: ""))
    }

    // ── helpers ──

    private fun download(urlString: String, out: File, expectedSize: Long) {
        val c = (URL(urlString).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = 30_000
            readTimeout = 60_000
            requestMethod = "GET"
        }
        try {
            c.connect()
            if (c.responseCode != HttpURLConnection.HTTP_OK) throw IOException("http_${c.responseCode}")
            val declared = c.contentLengthLong
            if (declared > MAX_ZIP_BYTES || (declared > 0 && declared != expectedSize)) throw IOException("size_mismatch")
            var total = 0L
            c.inputStream.use { input ->
                FileOutputStream(out).use { o ->
                    val buf = ByteArray(8192)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_ZIP_BYTES || total > expectedSize) throw IOException("size_exceeded")
                        o.write(buf, 0, n)
                    }
                }
            }
            if (total != expectedSize) throw IOException("size_mismatch")
        } finally {
            c.disconnect()
        }
    }

    private fun sha256(file: File): String {
        val d = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { s ->
            val buf = ByteArray(8192)
            while (true) { val n = s.read(buf); if (n < 0) break; d.update(buf, 0, n) }
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }

    private fun extractSafely(zip: File, target: File) {
        val targetCanon = target.canonicalPath
        var entries = 0
        var unpacked = 0L
        ZipInputStream(BufferedInputStream(FileInputStream(zip))).use { zis ->
            var e = zis.nextEntry
            while (e != null) {
                if (++entries > MAX_ENTRIES) throw SecurityException("too_many_entries")
                val name = e.name
                if (!OtaRules.isAcceptableEntryName(name)) throw SecurityException("bad_entry")
                val outFile = File(target, name)
                if (!OtaRules.isInside(targetCanon, outFile.canonicalPath, File.separator)) throw SecurityException("zip_slip")
                if (e.isDirectory) {
                    outFile.mkdirs()
                } else {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { o ->
                        val buf = ByteArray(8192)
                        while (true) {
                            val n = zis.read(buf)
                            if (n < 0) break
                            unpacked += n
                            if (unpacked > MAX_UNPACKED_BYTES) throw SecurityException("too_large_unpacked")
                            o.write(buf, 0, n)
                        }
                    }
                }
                zis.closeEntry()
                e = zis.nextEntry
            }
        }
    }

    private fun findIndexHtml(dir: File): File? {
        File(dir, "index.html").takeIf { it.isFile }?.let { return it }
        dir.listFiles()?.forEach { child ->
            if (child.isDirectory) File(child, "index.html").takeIf { it.isFile }?.let { return it }
        }
        return null
    }

    private fun cleanOldBundles(keepVersion: String) {
        File(context.filesDir, BUNDLES_DIR).listFiles()?.forEach { if (it.isDirectory && it.name != keepVersion) it.deleteRecursively() }
    }

    private fun errorResult(message: String): JSObject = JSObject().put("success", false).put("error", message)
}
