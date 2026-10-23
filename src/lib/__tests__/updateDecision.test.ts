import { describe, it, expect } from "vitest";
import { decideUpdate, parseUpdateAnswer, makeSnooze, safeStoreUrl, WORKER_PLAY_STORE_URL, SOFT_SNOOZE_MS } from "../updateDecision";

const now = 1_000_000;
const a = (o: Record<string, unknown>) => parseUpdateAnswer({ contract_version: 1, app: "worker", platform: "android", ...o });

describe("server decision is used directly", () => {
  it("none", () => expect(decideUpdate({ answer: a({ decision: "none" }), now })).toBe("none"));
  it("soft", () => expect(decideUpdate({ answer: a({ decision: "soft", latest_build: 103 }), now })).toBe("soft"));
  it("force", () => expect(decideUpdate({ answer: a({ decision: "force", min_build: 103 }), now })).toBe("force"));
  it("inactive target (only contract_version + none) → none", () =>
    expect(decideUpdate({ answer: parseUpdateAnswer({ contract_version: 1, decision: "none" }), now })).toBe("none"));
});

describe("offline / malformed never lock out", () => {
  it("no answer (offline)", () => expect(decideUpdate({ answer: null, now })).toBe("none"));
  it("garbage", () => {
    for (const r of [null, "x", 5, {}, { decision: "FORCE" }, { decision: "lock" }])
      expect(decideUpdate({ answer: parseUpdateAnswer(r), now })).toBe("none");
  });
  it("force without min_build ignored", () => expect(parseUpdateAnswer({ decision: "force" }).decision).toBe("none"));
  it("answer for another app/platform ignored", () => {
    expect(parseUpdateAnswer({ app: "user", platform: "android", decision: "force", min_build: 9 }).decision).toBe("none");
    expect(parseUpdateAnswer({ app: "worker", platform: "ios", decision: "force", min_build: 9 }).decision).toBe("none");
  });
});

describe("store redirection", () => {
  it("accepts official listing", () => expect(safeStoreUrl(WORKER_PLAY_STORE_URL)).toBe(WORKER_PLAY_STORE_URL));
  it("rejects other packages/hosts", () => {
    for (const u of ["https://play.google.com/store/apps/details?id=com.didinow.partner", "http://play.google.com/store/apps/details?id=app.didisnow.worker",
      "https://evil.com/store/apps/details?id=app.didisnow.worker", "nonsense", undefined])
      expect(safeStoreUrl(u)).toBe(WORKER_PLAY_STORE_URL);
  });
  it("parsed answer always carries safe url", () =>
    expect(a({ decision: "soft", store_url: "https://evil.com" }).storeUrl).toBe(WORKER_PLAY_STORE_URL));
});

describe("active bookings and alerts", () => {
  it("force deferred during active work, applies after", () => {
    for (const s of ["assigned", "accepted", "on_the_way", "started", "in_progress"])
      expect(decideUpdate({ answer: a({ decision: "force", min_build: 103 }), activeBookingStatus: s, now })).toBe("force_deferred");
    expect(decideUpdate({ answer: a({ decision: "force", min_build: 103 }), activeBookingStatus: "completed", now })).toBe("force");
  });
  it("soft hidden during booking or open alert", () => {
    expect(decideUpdate({ answer: a({ decision: "soft", latest_build: 103 }), activeBookingStatus: "started", now })).toBe("none");
    expect(decideUpdate({ answer: a({ decision: "soft", latest_build: 103 }), bookingAlertOpen: true, now })).toBe("none");
  });
});

describe("Later snooze", () => {
  it("hides until 3 days or a newer build", () => {
    const snooze = makeSnooze(103, now);
    const ans = a({ decision: "soft", latest_build: 103 });
    expect(decideUpdate({ answer: ans, snooze, now: now + 1000 })).toBe("none");
    expect(decideUpdate({ answer: ans, snooze, now: now + SOFT_SNOOZE_MS + 1 })).toBe("soft");
    expect(decideUpdate({ answer: a({ decision: "soft", latest_build: 104 }), snooze, now: now + 1000 })).toBe("soft");
  });
  it("snooze never hides force", () =>
    expect(decideUpdate({ answer: a({ decision: "force", min_build: 103 }), snooze: makeSnooze(999, now), now })).toBe("force"));
});

import { offerAlertActive, OFFER_ALERT_MAX_MS } from "../updateDecision";

describe("booking offer popup vs update prompts", () => {
  const soft = a({ decision: "soft", latest_build: 103 });
  const force = a({ decision: "force", min_build: 103 });
  it("soft hidden immediately while offer visible, back after it clears", () => {
    expect(decideUpdate({ answer: soft, bookingAlertOpen: true, now })).toBe("none");
    expect(decideUpdate({ answer: soft, bookingAlertOpen: false, now })).toBe("soft");
  });
  it("force never covers Accept/Reject: deferred while offer visible", () => {
    expect(decideUpdate({ answer: force, bookingAlertOpen: true, now })).toBe("force_deferred");
    expect(decideUpdate({ answer: force, bookingAlertOpen: false, now })).toBe("force");
  });
  it("offer + active booking together still defer", () =>
    expect(decideUpdate({ answer: force, bookingAlertOpen: true, activeBookingStatus: "accepted", now })).toBe("force_deferred"));
  it("Later cooldown still holds after the offer clears", () =>
    expect(decideUpdate({ answer: soft, snooze: makeSnooze(103, now), bookingAlertOpen: false, now: now + 1000 })).toBe("none"));
  it("offer active until its expiry", () => {
    const t = new Date(now + 30_000).toISOString();
    expect(offerAlertActive({ timeoutAt: t }, now, now + 29_000)).toBe(true);
    expect(offerAlertActive({ timeoutAt: t }, now, now + 31_000)).toBe(false);
  });
  it("offer without/with broken expiry stops counting after the cap", () => {
    expect(offerAlertActive({}, now, now + OFFER_ALERT_MAX_MS - 1)).toBe(true);
    expect(offerAlertActive({ timeoutAt: "bad" }, now, now + OFFER_ALERT_MAX_MS + 1)).toBe(false);
    expect(offerAlertActive({ timeoutAt: new Date(now + 3_600_000).toISOString() }, now, now + OFFER_ALERT_MAX_MS + 1)).toBe(false);
  });
  it("no offer → inactive", () => expect(offerAlertActive(null, null, now)).toBe(false));
});
