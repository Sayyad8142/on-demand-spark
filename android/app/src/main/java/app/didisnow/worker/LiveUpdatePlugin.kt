package app.didisnow.worker

import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.JSObject
import kotlinx.coroutines.*
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/**
 * Native Capacitor plugin for OTA Live Updates — "DidiLiveUpdate"
 *
 * - Downloads a zip bundle from a URL
 * - Verifies SHA-256 integrity (if hash provided)
 * - Extracts to internal storage
 * - Swaps Capacitor WebView via setServerBasePath + reload
 * - Boot-health marker for automatic rollback
 */
@CapacitorPlugin(name = "DidiLiveUpdate")
class LiveUpdatePlugin : Plugin() {

    companion object {
        private const val TAG = "DidiLiveUpdate"
        private const val BUNDLES_DIR = "ota_bundles"
        private const val PREFS_NAME = "didi_live_update_prefs"
        private const val PREF_ACTIVE_PATH = "active_bundle_path"
        private const val PREF_ACTIVE_VERSION = "active_bundle_version"
        private const val PREF_PENDING_VERSION = "pending_bundle_version"
        private const val PREF_BOOT_CONFIRMED = "boot_confirmed"
    }

    /**
     * Download a zip bundle, verify SHA-256, extract, and set as active bundle.
     * JS call: DidiLiveUpdatePlugin.downloadAndApply({ url, version, sha256? })
     */
    @PluginMethod
    fun downloadAndApply(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.resolve(errorResult("Missing 'url' parameter"))
            return
        }
        val version = call.getString("version") ?: run {
            call.resolve(errorResult("Missing 'version' parameter"))
            return
        }
        val expectedSha256 = call.getString("sha256") // nullable — skip check if null

        Log.d(TAG, "📦 Starting download: version=$version url=$url sha256=${expectedSha256?.take(12)}...")

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val bundleDir = File(context.filesDir, "$BUNDLES_DIR/$version")

                // Clean up if this version dir already exists (retry scenario)
                if (bundleDir.exists()) {
                    bundleDir.deleteRecursively()
                }
                bundleDir.mkdirs()

                // Download the zip
                val zipFile = File(context.cacheDir, "bundle_$version.zip")
                downloadFile(url, zipFile)
                Log.d(TAG, "📦 Downloaded zip: ${zipFile.length()} bytes")

                // SHA-256 integrity check
                if (!expectedSha256.isNullOrEmpty()) {
                    val actualSha256 = computeSha256(zipFile)
                    if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                        zipFile.delete()
                        bundleDir.deleteRecursively()
                        val msg = "SHA-256 mismatch: expected=${expectedSha256.take(12)}… actual=${actualSha256.take(12)}…"
                        Log.e(TAG, "📦 $msg")
                        call.resolve(errorResult(msg))
                        return@launch
                    }
                    Log.d(TAG, "📦 SHA-256 verified ✓")
                }

                // Extract the zip
                extractZip(zipFile, bundleDir)
                Log.d(TAG, "📦 Extracted to: ${bundleDir.absolutePath}")

                // Clean up zip
                zipFile.delete()

                // Verify extraction has an index.html
                val indexFile = findIndexHtml(bundleDir)
                if (indexFile == null) {
                    bundleDir.deleteRecursively()
                    call.resolve(errorResult("Invalid bundle: no index.html found"))
                    return@launch
                }

                // The serve path is the directory containing index.html
                val servePath = indexFile.parentFile?.absolutePath ?: bundleDir.absolutePath

                // Save as pending bundle (not confirmed until React boots successfully)
                val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
                prefs.edit()
                    .putString(PREF_ACTIVE_PATH, servePath)
                    .putString(PREF_ACTIVE_VERSION, version)
                    .putString(PREF_PENDING_VERSION, version)
                    .putBoolean(PREF_BOOT_CONFIRMED, false)
                    .apply()

                // Set the server base path on the bridge (Capacitor-supported API)
                activity.runOnUiThread {
                    try {
                        bridge?.serverBasePath = servePath
                        Log.d(TAG, "📦 Server base path set to: $servePath")
                    } catch (e: Exception) {
                        Log.e(TAG, "📦 Failed to set server path", e)
                    }
                }

                // Clean up old bundles (keep only current)
                cleanOldBundles(version)

                val result = JSObject()
                result.put("success", true)
                result.put("path", servePath)
                call.resolve(result)

            } catch (e: Exception) {
                Log.e(TAG, "📦 Download/apply failed", e)
                call.resolve(errorResult(e.message ?: "Unknown error"))
            }
        }
    }

    /**
     * Reload the WebView using Capacitor's bridge.reload() (no direct loadUrl).
     */
    @PluginMethod
    fun reload(call: PluginCall) {
        activity.runOnUiThread {
            try {
                bridge?.reload()
                Log.d(TAG, "📦 WebView reloaded via bridge.reload()")
            } catch (e: Exception) {
                Log.e(TAG, "📦 Reload failed", e)
            }
        }
        call.resolve()
    }

    /**
     * Confirm boot was successful — clears pending state.
     * Called from JS after React mounts successfully.
     */
    @PluginMethod
    fun confirmBoot(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        prefs.edit()
            .remove(PREF_PENDING_VERSION)
            .putBoolean(PREF_BOOT_CONFIRMED, true)
            .apply()
        Log.d(TAG, "📦 Boot confirmed ✓")
        call.resolve()
    }

    /**
     * Reset to the built-in bundle (shipped with APK)
     */
    @PluginMethod
    fun reset(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        prefs.edit().clear().apply()

        // Delete all downloaded bundles
        val bundlesRoot = File(context.filesDir, BUNDLES_DIR)
        if (bundlesRoot.exists()) {
            bundlesRoot.deleteRecursively()
        }

        activity.runOnUiThread {
            try {
                bridge?.serverBasePath = null
                bridge?.reload()
                Log.d(TAG, "📦 Reset to built-in bundle")
            } catch (e: Exception) {
                Log.e(TAG, "📦 Reset failed", e)
            }
        }
        call.resolve()
    }

    /**
     * Get the current active bundle path
     */
    @PluginMethod
    fun getCurrentPath(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        val path = prefs.getString(PREF_ACTIVE_PATH, "") ?: ""
        val result = JSObject()
        result.put("path", path)
        call.resolve(result)
    }

    // ── Helper methods ──

    private fun downloadFile(urlString: String, outputFile: File) {
        val url = URL(urlString)
        val connection = url.openConnection() as HttpURLConnection
        connection.connectTimeout = 30_000
        connection.readTimeout = 60_000
        connection.requestMethod = "GET"

        try {
            connection.connect()
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                throw IOException("HTTP ${connection.responseCode}: ${connection.responseMessage}")
            }

            connection.inputStream.use { input ->
                FileOutputStream(outputFile).use { output ->
                    input.copyTo(output, bufferSize = 8192)
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { fis ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (fis.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun extractZip(zipFile: File, targetDir: File) {
        ZipInputStream(BufferedInputStream(FileInputStream(zipFile))).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val outFile = File(targetDir, entry.name)

                // Security: prevent zip slip
                if (!outFile.canonicalPath.startsWith(targetDir.canonicalPath)) {
                    throw SecurityException("Zip entry outside target dir: ${entry.name}")
                }

                if (entry.isDirectory) {
                    outFile.mkdirs()
                } else {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { fos ->
                        zis.copyTo(fos, bufferSize = 8192)
                    }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }
    }

    /**
     * Recursively find index.html in the extracted bundle.
     * Handles both flat (index.html at root) and nested (dist/index.html) structures.
     */
    private fun findIndexHtml(dir: File): File? {
        val direct = File(dir, "index.html")
        if (direct.exists()) return direct

        dir.listFiles()?.forEach { child ->
            if (child.isDirectory) {
                val nested = File(child, "index.html")
                if (nested.exists()) return nested
            }
        }
        return null
    }

    private fun cleanOldBundles(keepVersion: String) {
        val bundlesRoot = File(context.filesDir, BUNDLES_DIR)
        bundlesRoot.listFiles()?.forEach { dir ->
            if (dir.isDirectory && dir.name != keepVersion) {
                Log.d(TAG, "📦 Cleaning old bundle: ${dir.name}")
                dir.deleteRecursively()
            }
        }
    }

    private fun errorResult(message: String): JSObject {
        val result = JSObject()
        result.put("success", false)
        result.put("error", message)
        return result
    }
}
