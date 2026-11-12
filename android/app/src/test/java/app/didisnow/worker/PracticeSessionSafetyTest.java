package app.didisnow.worker;

import android.content.Context;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class PracticeSessionSafetyTest {
    private Context ctx;
    private final PracticeSession session = PracticeSession.INSTANCE;
    private final String id = "practice-12345678-1234-4123-8123-123456789abc";
    private long expiry;
    private final String TOKEN = PracticeSession.INSTANCE.sha256("test-token");
    @Before public void reset() {
        ctx = RuntimeEnvironment.getApplication();
        ctx.getSharedPreferences("booking_offer_queue", 0).edit().clear().commit();
        ctx.getSharedPreferences("worker_prefs", 0).edit().clear().putString("user_id", "own-login").commit();
        expiry = System.currentTimeMillis() + 60000;
        session.prepare(ctx, id, expiry, "own-login", TOKEN, System.currentTimeMillis());
    }
    @Test public void receiptIsDedupedAcrossRepeatedPushes() {
        assertEquals("ok", session.claimReceipt(ctx, id, expiry, TOKEN));
        assertEquals("drop", session.claimReceipt(ctx, id, expiry, TOKEN));
    }
    @Test public void changedAccountCannotReceiveOldPractice() {
        ctx.getSharedPreferences("worker_prefs", 0).edit().putString("user_id", "other-login").commit();
        assertEquals("drop", session.claimReceipt(ctx, id, expiry, TOKEN));
        assertEquals("", session.state(ctx).optString("id"));
    }
    @Test public void wrongExpiryOrIdCannotClaimReceipt() {
        assertEquals("drop", session.claimReceipt(ctx, id, expiry + 1, TOKEN));
        assertEquals("drop", session.claimReceipt(ctx, "practice-other", expiry, TOKEN));
    }
    @Test public void realOfferPreemptsPracticeWithoutWritingRealQueue() {
        String before = ctx.getSharedPreferences("booking_offer_queue", 0).getAll().toString();
        session.preempt(ctx);
        assertEquals("blocked", session.state(ctx).optString("outcome"));
        assertEquals(before, ctx.getSharedPreferences("booking_offer_queue", 0).getAll().toString());
        assertEquals("drop", session.claimReceipt(ctx, id, expiry, TOKEN));
    }
    @Test public void expiredPracticeCannotClaimDisplayEvidence() {
        session.prepare(ctx, id, System.currentTimeMillis() - 1, "own-login", "hash", System.currentTimeMillis());
        session.markOverlay(ctx, id);
        assertFalse(session.state(ctx).optBoolean("overlay"));
    }
    @Test public void firstOutcomeWinsAndDoesNotAssignRealWork() {
        assertTrue(session.outcome(ctx, id, "accepted"));
        assertFalse(session.outcome(ctx, id, "rejected"));
        assertEquals("accepted", session.state(ctx).optString("outcome"));
        assertFalse(OfferQueue.INSTANCE.isLocallyBusy(ctx));
    }

    @Test public void pushForAnotherDeviceTokenIsBlockedNotShown() {
        assertEquals("wrong_device", session.claimReceipt(ctx, id, expiry, session.sha256("other-phone")));
        assertEquals("wrong_device", session.claimReceipt(ctx, id, expiry, null));
        assertFalse(session.state(ctx).optBoolean("received"));
    }
    @Test public void latePushAfterServerCheckWindowIsStale() {
        long prepared = System.currentTimeMillis();
        session.prepare(ctx, id, expiry, "own-login", TOKEN, prepared);
        assertEquals("stale", session.claimReceipt(ctx, id, expiry, TOKEN, prepared + PracticeSession.MAX_RECEIPT_DELAY_MS + 1));
        assertEquals("stale", session.claimReceipt(ctx, id, expiry, TOKEN, prepared - 1));
        assertEquals("ok", session.claimReceipt(ctx, id, expiry, TOKEN, prepared + 1000));
    }
    @Test public void logoutOrCancelDropsDelayedPush() {
        session.cancel(ctx);
        assertEquals("drop", session.claimReceipt(ctx, id, expiry, TOKEN));
        session.prepare(ctx, id, expiry, "own-login", TOKEN, System.currentTimeMillis());
        ctx.getSharedPreferences("worker_prefs", 0).edit().remove("user_id").commit();
        assertEquals("drop", session.claimReceipt(ctx, id, expiry, TOKEN));
    }
    @Test public void tokenChangeCancelsPreparedPractice() {
        session.onTokenChanged(ctx);
        assertEquals("cancelled", session.state(ctx).optString("outcome"));
        assertEquals("drop", session.claimReceipt(ctx, id, expiry, TOKEN));
    }
    @Test public void activeRealWorkBlocksPracticeReadiness() {
        OfferQueue.INSTANCE.markLocallyBusy(ctx, "real-booking-1");
        assertTrue(session.realWorkSuspected(ctx));
    }
}
