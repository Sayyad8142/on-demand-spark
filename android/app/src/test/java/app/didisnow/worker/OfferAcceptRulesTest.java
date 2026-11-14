package app.didisnow.worker;
import org.junit.Test;
import static org.junit.Assert.*;
public class OfferAcceptRulesTest {
    @Test public void stableRefusalsAndDuplicateAreGone() {
        for (String error : new String[]{"offer-expired", "already-assigned", "not-offered", "duplicate offer", "request-not-found"}) assertEquals(error, "gone", OfferAcceptRules.outcome(error));
    }
    @Test public void unknownAndNetworkResponsesKeepOffer() {
        for (String error : new String[]{"JWT expired", "network", "HTTP 500", "unknown", "Server rejected: retry later"}) assertEquals(error, "retry", OfferAcceptRules.outcome(error));
    }
    @Test public void closedIsFinal() { assertEquals("closed", OfferAcceptRules.outcome("BOOKING_ACCEPTANCE_CLOSED: closed")); }
    @Test public void ownRowMustBeActiveAndBeforeDeadline() {
        assertTrue(OfferAcceptRules.active("pending", 60, 59));
        assertFalse(OfferAcceptRules.active("pending", 60, 60));
        assertFalse(OfferAcceptRules.active("timed_out", 60, 59));
    }
}