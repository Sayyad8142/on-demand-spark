package app.didisnow.worker;

import org.junit.Test;
import static org.junit.Assert.*;

public class BookingOfferLifecycleTest {
    @Test public void cancellationReleasesOnlyTheAcceptedBooking() {
        assertTrue(BookingOfferLifecycle.matches("first", "first"));
    }
    @Test public void oldCancellationCannotReleaseSecondBooking() {
        assertFalse(BookingOfferLifecycle.matches("second", "first"));
    }
    @Test public void firstCancellationCannotCloseSecondPopup() {
        assertFalse(BookingOfferLifecycle.matches("e11e9242", "first"));
    }
    @Test public void missingCancellationCannotReleaseAnyBooking() {
        assertFalse(BookingOfferLifecycle.matches("first", null));
        assertFalse(BookingOfferLifecycle.matches(null, "first"));
        assertFalse(BookingOfferLifecycle.matches("", ""));
    }
}