package app.didisnow.worker

/**
 * Shared address formatting rules for the native booking surfaces.
 *
 * Communities that have real Block/Building records (e.g. My Home Bhooja)
 * send the customer's selected block in the FCM payload as `building_name`.
 * That value is the only source of truth for those communities — the block
 * must NEVER be inferred from digits inside flat_no.
 *
 * Tower-encoded communities (e.g. Prestige High Fields) send no
 * `building_name`, so the existing flat_no parsing stays untouched.
 */
object AddressFormat {

    /** "Tower B" / "Block B" / "B" -> "B"; blank -> null */
    @JvmStatic
    fun blockLabel(buildingName: String?): String? {
        val raw = buildingName?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val stripped = raw.replace(Regex("^(?i)(tower|block|building|blk)\\s*[-:]?\\s*"), "").trim()
        return if (stripped.isEmpty()) raw else stripped
    }
}
