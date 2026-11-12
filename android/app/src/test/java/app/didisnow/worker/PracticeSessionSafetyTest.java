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
    @Before public void reset() {
        ctx = RuntimeEnvironment.getApplication();
        ctx.getSharedPreferences("booking_offer_queue", 0).edit().clear().commit();
        ctx.getSharedPreferences("worker_prefs", 0).edit().clear().putString("user_id", "own-login").commit();
        expiry = System.currentTimeMillis() + 60000;
        session.prepare(ctx, id, expiry, "own-login", session.sha256("test-token"));
    }
    @Test public void receiptIsDedupedAcrossRepeatedPushes() {
        assertTrue(session.claimReceipt(ctx, id, expiry));
        assertFalse(session.claimReceipt(ctx, id, expiry));
    }
    @Test public void changedAccountCannotReceiveOldPractice() {
        ctx.getSharedPreferences("worker_prefs", 0).edit().putString("user_id", "other-login").commit();
        assertFalse(session.claimReceipt(ctx, id, expiry));
        assertEquals("", session.state(ctx).optString("id"));
    }
    @Test public void wrongExpiryOrIdCannotClaimReceipt() {
        assertFalse(session.claimReceipt(ctx, id, expiry + 1));
        assertFalse(session.claimReceipt(ctx, "practice-other", expiry));
    }
    @Test public void realOfferPreemptsPracticeWithoutWritingRealQueue() {
        String before = ctx.getSharedPreferences("booking_offer_queue", 0).getAll().toString();
        session.preempt(ctx);
        assertEquals("blocked", session.state(ctx).optString("outcome"));
        assertEquals(before, ctx.getSharedPreferences("booking_offer_queue", 0).getAll().toString());
        assertFalse(session.claimReceipt(ctx, id, expiry));
    }
    @Test public void expiredPracticeCannotClaimDisplayEvidence() {
        session.prepare(ctx, id, System.currentTimeMillis() - 1, "own-login", "hash");
        session.markOverlay(ctx, id);
        assertFalse(session.state(ctx).optBoolean("overlay"));
    }
    @Test public void firstOutcomeWinsAndDoesNotAssignRealWork() {
        assertTrue(session.outcome(ctx, id, "accepted"));
        assertFalse(session.outcome(ctx, id, "rejected"));
        assertEquals("accepted", session.state(ctx).optString("outcome"));
        assertFalse(OfferQueue.INSTANCE.isLocallyBusy(ctx));
    }
}