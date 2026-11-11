package app.didisnow.worker

import java.net.URI
import java.net.URLDecoder

/**
 * Pure OTA safety rules (no Android imports, unit-testable with plain kotlinc).
 * Mirrors src/lib/otaSafety.ts — keep both in step.
 */
object OtaRules {
    const val APPROVED_HOST = "paywwbuqycovjopryele.supabase.co"
    const val APPROVED_PATH_PREFIX = "/storage/v1/object/public/ota-bundles/"
    const val MAX_ZIP_BYTES = 30L * 1024 * 1024
    const val MAX_UNPACKED_BYTES = 80L * 1024 * 1024
    const val MAX_ENTRIES = 3000

    private val VERSION_RE = Regex("^\\d{1,4}(\\.\\d{1,4}){0,3}$")
    private val SHA_RE = Regex("^[a-fA-F0-9]{64}$")

    fun isApprovedUrl(raw: String?): Boolean {
        if (raw == null || raw.length > 1000) return false
        return try {
            val u = URI(raw)
            if (u.scheme != "https" || u.host != APPROVED_HOST || u.port != -1 || u.userInfo != null) return false
            val path = u.rawPath ?: return false
            if (!path.startsWith(APPROVED_PATH_PREFIX)) return false
            val rest = URLDecoder.decode(path.removePrefix(APPROVED_PATH_PREFIX), "UTF-8")
            rest.isNotEmpty() && rest.endsWith(".zip") && rest.split("/").none { it == ".." || it == "." }
        } catch (_: Exception) { false }
    }

    fun isSafeVersion(v: String?): Boolean = v != null && VERSION_RE.matches(v)
    fun isValidSha(v: String?): Boolean = v != null && SHA_RE.matches(v)
    fun isValidSize(n: Long): Boolean = n in 1..MAX_ZIP_BYTES

    /** Raw ZIP entry name is acceptable before path resolution. */
    fun isAcceptableEntryName(name: String): Boolean =
        name.isNotEmpty() && !name.startsWith("/") && !name.contains('\\') && !name.contains('\u0000')

    /** Resolved entry path stays strictly inside the target (blocks "/t" vs "/tx" sibling prefixes). */
    fun isInside(targetCanonical: String, entryCanonical: String, separator: String = "/"): Boolean =
        entryCanonical == targetCanonical || entryCanonical.startsWith(targetCanonical.trimEnd('/', '\\') + separator)
}
