package app.didisnow.worker;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * One acceptance endpoint for every native path (Activity, Overlay, tray tap):
 * the existing try_accept_booking, identical to the published 10.0.05 build.
 * favorite-v1 status read is OFF until Admin confirms the contract; when ON a
 * failed/invalid answer gives no actionable offer (no legacy fallback).
 */
public final class OfferAcceptanceContract {
    private OfferAcceptanceContract() {}
    public static final String ACCEPT_RPC = "try_accept_booking";
    public static final boolean FAVORITE_V1_STATUS_ENABLED = false;
    public static final String STATUS_RPC = "get_my_offer_status";
    public static String rpc() { return ACCEPT_RPC; }

    private static final Set<String> STATUSES = new HashSet<>(Arrays.asList(
        "pending", "sent", "queued", "accepted", "rejected", "expired", "lost", "cancelled"));
    private static final Set<String> OPEN = new HashSet<>(Arrays.asList("pending", "sent", "queued"));

    /**
     * Pure favorite-v1 check. Returns a phone-clock deadline (epoch seconds) from the
     * server's remaining time, or 0 when the answer is invalid, mismatched or not actionable.
     */
    public static long favoriteDeadline(String contractVersion, String bookingId, String expectedBookingId,
                                        String requestId, String expectedRequestId, long generation,
                                        String status, Boolean actionable, long expiresAtSec, long serverTimeSec,
                                        long nowSec) {
        if (!"favorite-v1".equals(contractVersion)) return 0;
        if (bookingId == null || !bookingId.equals(expectedBookingId)) return 0;
        if (requestId == null || requestId.isEmpty()) return 0;
        if (expectedRequestId != null && !expectedRequestId.isEmpty() && !expectedRequestId.equals(requestId)) return 0;
        if (generation < 1 || status == null || !STATUSES.contains(status) || actionable == null) return 0;
        if (expiresAtSec <= 0 || serverTimeSec <= 0) return 0;
        if (!actionable || !OPEN.contains(status) || expiresAtSec <= serverTimeSec) return 0;
        long local = nowSec + (expiresAtSec - serverTimeSec);
        return local > nowSec ? local : 0;
    }
}
