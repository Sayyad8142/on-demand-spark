package app.didisnow.worker;

import java.util.Locale;

/** Display-only decisions. Only the authenticated accept RPC can assign work. */
public final class OfferAcceptRules {
    private OfferAcceptRules() {}
    public static String outcome(String error) {
        String text = error == null ? "" : error.toLowerCase(Locale.ROOT).trim();
        if (text.contains("BOOKING_ACCEPTANCE_CLOSED:".toLowerCase(Locale.ROOT)) || text.equals("acceptance-closed")) return "closed";
        if (text.matches(".*(session|log ?in|jwt|token|network|fetch|connection|offline|timed out|timeout).*")) return "retry";
        if (text.matches(".*(already|taken|expired|no longer|not available|unavailable|not pending|not open|assigned|cancel|not found|closed|not eligible|not offered|not-offered|request-not-found|duplicate).*")) return "gone";
        return "retry";
    }
    public static boolean active(String status, long deadline, long now) {
        return ("pending".equals(status) || "sent".equals(status) || "queued".equals(status)) && deadline > now;
    }
}