package app.didisnow.worker

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.util.concurrent.Executors

/** Bundled on-device recognition: no network, uploads, saved bank data or logs. */
@CapacitorPlugin(name = "PassbookScanner")
class PassbookScannerPlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    private var photo: File? = null
    private var photoUri: Uri? = null
    private var busy = false

    override fun load() {
        // Remove a cache photo left by process death. Never touch gallery originals.
        File(context.cacheDir, "passbook-scan").listFiles()?.forEach { it.delete() }
    }

    private fun cleanup() {
        photoUri?.let { context.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
        photo?.delete(); photo = null; photoUri = null; busy = false
    }

    @PluginMethod
    fun scan(call: PluginCall) {
        if (busy) { call.reject("busy"); return }
        val source = call.getString("source")
        if (source != "camera" && source != "gallery") { call.reject("invalid_source"); return }
        busy = true
        try {
            val intent = if (source == "camera") {
                val dir = File(context.cacheDir, "passbook-scan").apply { mkdirs() }
                val file = File.createTempFile("scan-", ".jpg", dir)
                photo = file
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                photoUri = uri
                Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    clipData = ClipData.newRawUri("passbook", uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }
            } else Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "image/*"; addCategory(Intent.CATEGORY_OPENABLE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivityForResult(call, intent, "imageSelected")
        } catch (_: Exception) { cleanup(); call.reject("unavailable") }
    }

    @ActivityCallback
    private fun imageSelected(call: PluginCall?, result: ActivityResult) {
        if (call == null) { cleanup(); return }
        if (result.resultCode != Activity.RESULT_OK) { cleanup(); call.reject("cancelled"); return }
        val uri = photoUri ?: result.data?.data
        if (uri == null) { cleanup(); call.reject("invalid_image"); return }
        executor.execute {
            var bitmap: Bitmap? = null
            try {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException()
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2400) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
                val decoded = bitmap ?: throw IllegalArgumentException()
                val orientation = context.contentResolver.openInputStream(uri)?.use {
                    ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
                } ?: ExifInterface.ORIENTATION_NORMAL
                val rotation = when (orientation) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
                val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                recognizer.process(InputImage.fromBitmap(decoded, rotation))
                    .addOnSuccessListener { text -> call.resolve(JSObject().put("text", text.text)) }
                    .addOnFailureListener { call.reject("scan_failed") }
                    .addOnCompleteListener { recognizer.close(); decoded.recycle(); cleanup() }
            } catch (_: Exception) { bitmap?.recycle(); cleanup(); call.reject("scan_failed") }
            catch (_: OutOfMemoryError) { bitmap?.recycle(); cleanup(); call.reject("scan_failed") }
        }
    }

    override fun handleOnDestroy() { cleanup(); executor.shutdown(); super.handleOnDestroy() }
}