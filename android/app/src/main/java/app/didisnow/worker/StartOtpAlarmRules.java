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
}