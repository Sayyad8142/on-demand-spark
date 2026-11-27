package app.didisnow.worker

/** Pure, Android-free OCR layout rules (checked by scripts/check-passbook-rules.sh). */
object PassbookOcrRules {
    data class Word(val text: String, val left: Int, val right: Int)

    /** Joins one recognised line, starting a new line at wide gaps so pattern noise never merges with a name. */
    fun splitWideGaps(words: List<Word>, lineHeight: Int): List<String> {
        val out = ArrayList<String>()
        val current = StringBuilder()
        var lastRight = Int.MIN_VALUE
        val gap = maxOf((lineHeight * 1.6).toInt(), 12)
        for (word in words.sortedBy { it.left }) {
            val text = word.text.trim()
            if (text.isEmpty()) continue
            if (current.isNotEmpty() && word.left - lastRight > gap) { out.add(current.toString()); current.setLength(0) }
            if (current.isNotEmpty()) current.append(' ')
            current.append(text)
            lastRight = word.right
        }
        if (current.isNotEmpty()) out.add(current.toString())
        return out
    }

    /** Orientation score: readable letters and digits; a sideways photo reads far fewer. */
    fun readableScore(text: String): Int = text.count { it.isLetterOrDigit() }

    /** Sideways cheques are only tried for portrait photos. */
    fun turnsToTry(width: Int, height: Int): List<Int> = if (height > width) listOf(0, 90, 270) else listOf(0)

    /** Long side kept between 1400 and 2400 px: enlarge small photos (max 2x), reduce large ones. */
    fun targetScale(width: Int, height: Int): Float {
        val long = maxOf(width, height).toFloat()
        if (long <= 0f) return 1f
        return if (long < 1400f) minOf(2f, 2000f / long) else minOf(1f, 2400f / long)
    }
}
