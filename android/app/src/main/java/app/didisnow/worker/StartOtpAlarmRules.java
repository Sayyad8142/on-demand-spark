package app.didisnow.worker;

/** Pure reminder-only rules. Never authorize booking changes or inspect OTP digits. */
public final class StartOtpAlarmRules {
    private StartOtpAlarmRules() {}
    public static boolean shouldYieldSpeech(String phrase) {
        return phrase != null && phrase.startsWith("OTP");
    }
    public static boolean eligible(String status, boolean required, boolean started, String assigned, String worker) {
        return required && !started && worker != null && worker.equals(assigned)
            && ("assigned".equals(status) || "accepted".equals(status) || "on_the_way".equals(status));
    }
    public static int phase(long acceptedAt, long serverNow) {
        if (acceptedAt <= 0) return 0;
        long age = serverNow - acceptedAt;
        // 10 min: one finite clip; 15 min: continuous (code 3). The old 20-minute trigger is removed.
        return age >= 900000L ? 3 : age >= 600000L ? 1 : 0;
    }
    /** Missed finite clips are not queued; a failed start may retry within 90 seconds. */
    public static boolean shouldPlay(long acceptedAt, long serverNow, boolean alreadyPlayed) {
        int phase = phase(acceptedAt, serverNow);
        if (phase == 3) return true;
        if (phase == 0 || alreadyPlayed) return false;
        return serverNow - acceptedAt - 600000L <= 90000L;
    }
    /** No catch-up for the finite 10-minute clip; continuous mode has no upper cutoff. */
    public static long nextAt(long acceptedAt, long serverNow) {
        for (long offset : new long[]{600000L, 900000L})
            if (acceptedAt + offset > serverNow) return acceptedAt + offset;
        return serverNow;
    }
    /**
     * Reads get_my_late_start_status and returns booking id → alarm anchor (deadline_at − deadline_minutes).
     * Requires deadline_rule_version >= 2; null/unparseable deadlines and unmeasurable rows are omitted.
     * Throws on a malformed or old-rule response so the engine keeps its last known rows.
     */
    public static java.util.Map<String, Long> parseDeadlines(String json) throws org.json.JSONException {
        org.json.JSONObject r = new org.json.JSONObject(json);
        if (r.optInt("deadline_rule_version", 0) < 2) throw new org.json.JSONException("Old deadline rule");
        org.json.JSONArray rows = r.getJSONArray("bookings");
        java.util.Map<String, Long> out = new java.util.HashMap<>();
        for (int i = 0; i < rows.length(); i++) {
            org.json.JSONObject b = rows.getJSONObject(i);
            String id = b.optString("booking_id", "");
            String basis = b.optString("deadline_basis", "");
            int minutes = b.optInt("deadline_minutes", 0);
            if (id.isEmpty() || b.isNull("deadline_at") || basis.startsWith("unmeasurable") || minutes <= 0) continue;
            long deadline = parseInstant(b.optString("deadline_at", ""));
            if (deadline > 0) out.put(id, deadline - minutes * 60000L);
        }
        return out;
    }
    /** API 24-safe ISO parse (optional fraction, Z or ±HH:MM / ±HH offset). */
    static long parseInstant(String raw) {
        try {
            String v = raw.trim().replace(' ', 'T').replace("Z", "+00:00");
            v = v.replaceAll("([+-]\\d{2})$", "$1:00").replaceAll("([+-]\\d{2}):(\\d{2})$", "$1$2");
            if (!v.contains(".")) v = v.replaceAll("(T\\d{2}:\\d{2}:\\d{2})", "$1.000");
            v = v.replaceAll("\\.(\\d{1,3})\\d*", ".$1");
            v = v.replaceAll("\\.(\\d)([+-])", ".$100$2").replaceAll("\\.(\\d{2})([+-])", ".$10$2");
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", java.util.Locale.US);
            f.setLenient(false);
            java.util.Date d = f.parse(v);
            return d == null ? 0L : d.getTime();
        } catch (Exception e) { return 0L; }
    }
}
