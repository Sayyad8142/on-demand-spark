import app.didisnow.worker.PassbookOcrRules
import app.didisnow.worker.PassbookOcrRules.Word

private var failures = 0
private fun check(name: String, ok: Boolean) { if (ok) println("ok  $name") else { failures++; println("FAIL $name") } }

fun main() {
    // Pattern noise far left of the printed name becomes its own line.
    check("wide gap splits noise from name", PassbookOcrRules.splitWideGaps(
        listOf(Word("AN", 10, 40), Word("SAYYAD", 900, 1010), Word("KALEESHA", 1025, 1160), Word("BOKHARI", 1175, 1290)), 30
    ) == listOf("AN", "SAYYAD KALEESHA BOKHARI"))
    check("normal spacing stays one line", PassbookOcrRules.splitWideGaps(
        listOf(Word("IFSC:", 300, 380), Word("RTGS", 10, 90), Word("HDFC0004216", 395, 600)), 30
    ) == listOf("RTGS", "IFSC: HDFC0004216"))
    check("portrait tries both sideways turns", PassbookOcrRules.turnsToTry(900, 1600) == listOf(0, 90, 270))
    check("landscape stays upright", PassbookOcrRules.turnsToTry(1600, 900) == listOf(0))
    check("small photo enlarged at most 2x", PassbookOcrRules.targetScale(800, 600) == 2f)
    check("large photo reduced to 2400", PassbookOcrRules.targetScale(4800, 3600) == 0.5f)
    check("medium photo untouched", PassbookOcrRules.targetScale(1600, 1200) == 1f)
    if (failures > 0) { println("$failures failed"); kotlin.system.exitProcess(1) }
    println("all passbook rules passed")
}
