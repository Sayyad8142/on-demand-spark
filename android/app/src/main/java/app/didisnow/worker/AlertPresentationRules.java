package app.didisnow.worker;

/** Display-only rules; the server still authorizes every booking action. */
public final class AlertPresentationRules {
    private AlertPresentationRules() {}

    public static long deadline(long expires, long sent, int ttl, long now) {
        int safeTtl = ttl >= 1 && ttl <= 600 ? ttl : 60;
        return expires > 0 ? expires : (sent > 0 ? sent : now) + safeTtl;
    }

    public static int remaining(long deadline, long now) {
        return (int) Math.min(600L, Math.max(0L, deadline - now));
    }

    public static boolean mayAccept(long originalDeadline, long now, boolean closed) {
        return !closed && originalDeadline > 0 && now < originalDeadline;
    }

    public static boolean mayOpenActivity(boolean foreground, boolean locked) {
        return foreground && !locked;
    }

    public static boolean mayAcknowledge(boolean attached, boolean visible, boolean focused,
                                         boolean closing, int remaining) {
        return attached && visible && focused && !closing && remaining > 0;
    }
}