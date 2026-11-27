package app.didisnow.worker

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.google.android.gms.tasks.Tasks
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
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
            val owned = ArrayList<Bitmap>()
            var recognizer: TextRecognizer? = null
            try {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException()
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2400) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                val decoded = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
                    ?: throw IllegalArgumentException()
                owned.add(decoded)
                val orientation = context.contentResolver.openInputStream(uri)?.use {
                    ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
                } ?: ExifInterface.ORIENTATION_NORMAL
                val exifTurn = when (orientation) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
                val scale = PassbookOcrRules.targetScale(decoded.width, decoded.height)
                val upright = transform(decoded, exifTurn, scale)
                if (upright !== decoded) { owned.add(upright); decoded.recycle() }
                val reader = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }
                // A portrait photo may be a sideways cheque: keep the orientation that reads best.
                var bestTurn = 0
                var bestText = ""
                for (turn in PassbookOcrRules.turnsToTry(upright.width, upright.height)) {
                    val image = if (turn == 0) upright else transform(upright, turn, 1f).also { owned.add(it) }
                    val text = read(reader, image)
                    if (bestText.isEmpty() || PassbookOcrRules.readableScore(text) > PassbookOcrRules.readableScore(bestText)) {
                        bestTurn = turn; bestText = text
                    }
                    if (image !== upright) { image.recycle(); owned.remove(image) }
                }
                // Second reading: grey, high-contrast copy that fades blue/green security patterns.
                val turned = if (bestTurn == 0) upright else transform(upright, bestTurn, 1f).also { owned.add(it) }
                val enhanced = enhance(turned).also { owned.add(it) }
                val texts = JSArray().apply { put(bestText); put(read(reader, enhanced)) }
                val result = JSObject()
                result.put("text", bestText)
                result.put("texts", texts)
                call.resolve(result)
            } catch (_: Exception) { call.reject("scan_failed") }
            catch (_: OutOfMemoryError) { call.reject("scan_failed") }
            finally {
                recognizer?.close()
                owned.forEach { if (!it.isRecycled) it.recycle() }
                cleanup()
            }
        }
    }

    private fun read(reader: TextRecognizer, bitmap: Bitmap): String =
        linesOf(Tasks.await(reader.process(InputImage.fromBitmap(bitmap, 0))))

    private fun linesOf(text: Text): String {
        val out = ArrayList<String>()
        for (block in text.textBlocks) for (line in block.lines) {
            val words = line.elements.map { element ->
                val box = element.boundingBox
                PassbookOcrRules.Word(element.text, box?.left ?: 0, box?.right ?: 0)
            }
            out.addAll(PassbookOcrRules.splitWideGaps(words, line.boundingBox?.height() ?: 0))
        }
        return out.joinToString("\n")
    }

    private fun transform(src: Bitmap, turn: Int, scale: Float): Bitmap {
        if (turn == 0 && scale == 1f) return src
        val matrix = Matrix().apply { postScale(scale, scale); postRotate(turn.toFloat()) }
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, matrix, true)
    }

    private fun enhance(src: Bitmap): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val c = 1.6f
        val t = (-0.5f * c + 0.5f) * 255f
        val r = 0.6f * c; val g = 0.3f * c; val b = 0.1f * c
        val matrix = ColorMatrix(floatArrayOf(r, g, b, 0f, t, r, g, b, 0f, t, r, g, b, 0f, t, 0f, 0f, 0f, 1f, 0f))
        Canvas(out).drawBitmap(src, 0f, 0f, Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) })
        return out
    }

    override fun handleOnDestroy() { cleanup(); executor.shutdown(); super.handleOnDestroy() }
}