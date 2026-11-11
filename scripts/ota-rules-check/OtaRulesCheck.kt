import app.didisnow.worker.OtaRules
fun check(name: String, ok: Boolean) { println((if (ok) "PASS " else "FAIL ") + name); if (!ok) System.exit(1) }
fun main() {
    val good = "https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/worker/1.2.0.zip"
    check("approved url", OtaRules.isApprovedUrl(good))
    check("http refused", !OtaRules.isApprovedUrl(good.replace("https", "http")))
    check("other host refused", !OtaRules.isApprovedUrl(good.replace("paywwbuqycovjopryele", "evil")))
    check("lookalike host refused", !OtaRules.isApprovedUrl("https://paywwbuqycovjopryele.supabase.co.evil.com/storage/v1/object/public/ota-bundles/a.zip"))
    check("port refused", !OtaRules.isApprovedUrl(good.replace(".co/", ".co:8443/")))
    check("userinfo refused", !OtaRules.isApprovedUrl("https://x@paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/a.zip"))
    check("other bucket refused", !OtaRules.isApprovedUrl(good.replace("ota-bundles", "worker-photos")))
    check("dotdot refused", !OtaRules.isApprovedUrl("https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/%2e%2e/x.zip"))
    check("non-zip refused", !OtaRules.isApprovedUrl(good.replace(".zip", ".apk")))
    check("version ok", OtaRules.isSafeVersion("10.0.4"))
    check("version path refused", !OtaRules.isSafeVersion("../1"))
    check("sha required", !OtaRules.isValidSha(null) && !OtaRules.isValidSha("abc") && OtaRules.isValidSha("a".repeat(64)))
    check("size", OtaRules.isValidSize(1) && !OtaRules.isValidSize(0) && !OtaRules.isValidSize(OtaRules.MAX_ZIP_BYTES + 1))
    check("inside", OtaRules.isInside("/d/t", "/d/t/a/index.html"))
    check("sibling prefix refused", !OtaRules.isInside("/d/t", "/d/tx/evil.js"))
    check("escape refused", !OtaRules.isInside("/d/t", "/d/evil.js"))
    check("abs entry refused", !OtaRules.isAcceptableEntryName("/etc/x") && !OtaRules.isAcceptableEntryName("a\\b"))
    println("ALL OK")
}
