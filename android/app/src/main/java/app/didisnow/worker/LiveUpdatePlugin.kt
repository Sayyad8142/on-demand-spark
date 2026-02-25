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
import java.util.zip.ZipInputStream

/**
 * Native Capacitor plugin for OTA Live Updates.
 * 
 * - Downloads a zip bundle from a URL
 * - Extracts it to internal storage
 * - Swaps the Capacitor WebView to serve from the new path
 * - Supports rollback to the built-in bundle
 */
@CapacitorPlugin(name = "LiveUpdate")
class LiveUpdatePlugin : Plugin() {

    companion object {
        private const val TAG = "LiveUpdate"
        private const val BUNDLES_DIR = "ota_bundles"
        private const val PREFS_NAME = "live_update_prefs"
        private const val PREF_ACTIVE_PATH = "active_bundle_path"
        private const val PREF_ACTIVE_VERSION = "active_bundle_version"
    }

    /**
     * Download a zip bundle from URL, extract it, and set as active bundle.
     * Called from JS: LiveUpdatePlugin.downloadAndApply({ url, version })
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

        Log.d(TAG, "📦 Starting download: version=$version url=$url")

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

                // Extract the zip
                extractZip(zipFile, bundleDir)
                Log.d(TAG, "📦 Extracted to: ${bundleDir.absolutePath}")

                // Clean up zip
                zipFile.delete()

                // Verify extraction has an index.html (basic sanity check)
                val indexFile = findIndexHtml(bundleDir)
                if (indexFile == null) {
                    bundleDir.deleteRecursively()
                    call.resolve(errorResult("Invalid bundle: no index.html found"))
                    return@launch
                }

                // The serve path is the directory containing index.html
                val servePath = indexFile.parentFile?.absolutePath ?: bundleDir.absolutePath

                // Save as active bundle
                val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
                prefs.edit()
                    .putString(PREF_ACTIVE_PATH, servePath)
                    .putString(PREF_ACTIVE_VERSION, version)
                    .apply()

                // Set the server path on the bridge
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
     * Reload the WebView to apply the new bundle
     */
    @PluginMethod
    fun reload(call: PluginCall) {
        activity.runOnUiThread {
            try {
                bridge?.webView?.let { webView ->
                    val path = bridge?.serverBasePath
                    if (path != null) {
                        webView.loadUrl("file://$path/index.html")
                    } else {
                        bridge?.reload()
                    }
                } ?: bridge?.reload()
                Log.d(TAG, "📦 WebView reloaded")
            } catch (e: Exception) {
                Log.e(TAG, "📦 Reload failed", e)
            }
        }
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
        // Check direct child first
        val direct = File(dir, "index.html")
        if (direct.exists()) return direct

        // Check one level deep (e.g., dist/index.html)
        dir.listFiles()?.forEach { child ->
            if (child.isDirectory) {
                val nested = File(child, "index.html")
                if (nested.exists()) return nested
            }
        }
        return null
    }

    /**
     * Remove old bundle directories, keeping only the current version
     */
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
