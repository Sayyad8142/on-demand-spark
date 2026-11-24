package app.didisnow.worker;
import org.junit.Test;
import static org.junit.Assert.*;
public class OfferAcceptanceContractTest {
    @Test public void secureEndpointPreparedButNotActivatedWithoutGrant() {
        assertFalse(OfferAcceptanceContract.SECURE_ENABLED);
        assertEquals("try_accept_booking", OfferAcceptanceContract.rpc());
        assertEquals("accept_booking", OfferAcceptanceContract.rpc(true));
    }
    @Test public void oldClosureCannotRetireNewServerGeneration() {
        assertFalse(OfferAcceptRules.closureApplies(1120, 1060));
        assertTrue(OfferAcceptRules.closureApplies(1060, 1060));
        assertFalse(OfferAcceptRules.closureApplies(1060, 0));
    }
}