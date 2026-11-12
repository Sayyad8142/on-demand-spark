package app.didisnow.worker;

import org.junit.Test;
import static org.junit.Assert.*;

public class OfferAcceptanceDeadlineTest {
    @Test public void acceptAllowedOnlyBeforeAbsoluteExpiry() {
        assertTrue(AlertPresentationRules.mayAccept(1060, 1059, false));
        assertFalse(AlertPresentationRules.mayAccept(1060, 1060, false));
        assertFalse(AlertPresentationRules.mayAccept(1060, 1061, false));
    }
    @Test public void refreshCannotExtendDeadline() {
        long original = AlertPresentationRules.deadline(1060, 1000, 60, 1058);
        assertTrue(AlertPresentationRules.mayAccept(original, 1058, false));
        assertFalse(AlertPresentationRules.mayAccept(original, 1062, false));
    }
    @Test public void retryResumesOnlyRemainingOriginalSeconds() {
        assertEquals(3, AlertPresentationRules.remaining(1060, 1057));
        assertTrue(AlertPresentationRules.mayAccept(1060, 1057, false));
        assertEquals(0, AlertPresentationRules.remaining(1060, 1065));
        assertFalse(AlertPresentationRules.mayAccept(1060, 1065, false));
    }
    @Test public void missingDeadlineOrClosedSurfaceCannotAccept() {
        assertFalse(AlertPresentationRules.mayAccept(0, 1000, false));
        assertFalse(AlertPresentationRules.mayAccept(1060, 1000, true));
    }
}