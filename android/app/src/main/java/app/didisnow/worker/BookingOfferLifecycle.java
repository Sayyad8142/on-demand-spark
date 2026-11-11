package app.didisnow.worker;

/** Presentation-only rules. A server cancellation may release only its own local lock. */
public final class BookingOfferLifecycle {
    private BookingOfferLifecycle() {}

    public static boolean matches(String currentBookingId, String endedBookingId) {
        return currentBookingId != null && !currentBookingId.isBlank()
            && currentBookingId.equals(endedBookingId);
    }
}