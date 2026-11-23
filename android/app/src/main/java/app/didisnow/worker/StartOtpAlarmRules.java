package app.didisnow.worker;

/** Pure reminder-only rules. Never authorize booking changes or inspect OTP digits. */
public final class StartOtpAlarmRules {
    private StartOtpAlarmRules() {}
    public static boolean eligible(String status, boolean required, boolean started, String assigned, String worker) {
        return required && !started && worker != null && worker.equals(assigned)
            && ("assigned".equals(status) || "accepted".equals(status) || "on_the_way".equals(status));
    }
    public static int phase(long acceptedAt, long serverNow) {
        if (acceptedAt <= 0) return 0;
        long age = serverNow - acceptedAt;
        return age >= 1200000L ? 3 : age >= 900000L ? 2 : age >= 600000L ? 1 : 0;
    }
    /** Missed finite clips are not queued; a failed start may retry within 90 seconds. */
    public static boolean shouldPlay(long acceptedAt, long serverNow, boolean alreadyPlayed) {
        int phase = phase(acceptedAt, serverNow);
        if (phase == 3) return true;
        if (phase == 0 || alreadyPlayed) return false;
        long offset = phase == 1 ? 600000L : 900000L;
        return serverNow - acceptedAt - offset <= 90000L;
    }
    /** No catch-up for the two finite clips; continuous mode has no upper cutoff. */
    public static long nextAt(long acceptedAt, long serverNow) {
        for (long offset : new long[]{600000L, 900000L, 1200000L})
            if (acceptedAt + offset > serverNow) return acceptedAt + offset;
        return serverNow;
    }
}