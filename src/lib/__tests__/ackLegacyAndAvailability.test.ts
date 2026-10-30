import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getUser: vi.fn() }, from: vi.fn() } }));
import { buildLegacyAckBody, ackErrorStatus, LEGACY_ACK_EVENT } from "@/lib/bookingAck";
import { buildAvailabilityRequest } from "@/lib/availabilityRequest";

describe("legacy ACK receiver compatibility", () => {
  it("maps push_received to received", () => {
    expect(buildLegacyAckBody({ bookingId: "b", workerId: "w", event: "push_received" })?.event_type).toBe("received");
  });
  it("maps popup_shown and worker_seen to opened", () => {
    expect(LEGACY_ACK_EVENT.popup_shown).toBe("opened");
    expect(LEGACY_ACK_EVENT.worker_seen).toBe("opened");
  });
  it("never re-sends accept/reject taps in legacy form", () => {
    expect(buildLegacyAckBody({ bookingId: "b", workerId: "w", event: "accept_tapped" })).toBeNull();
    expect(buildLegacyAckBody({ bookingId: "b", workerId: "w", event: "reject_tapped" })).toBeNull();
  });
  it("needs both booking id and worker id", () => {
    expect(buildLegacyAckBody({ workerId: "w", event: "push_received" })).toBeNull();
    expect(buildLegacyAckBody({ bookingId: "b", workerId: null, event: "push_received" })).toBeNull();
  });
  it("never carries the signed token", () => {
    const b = buildLegacyAckBody({ bookingId: "b", workerId: "w", event: "push_received" })!;
    expect("ack_token" in b).toBe(false);
  });
  it("reads the HTTP status from a function error", () => {
    expect(ackErrorStatus({ context: { status: 400 } })).toBe(400);
    expect(ackErrorStatus(new Error("x"))).toBeNull();
  });
});

describe("availability request", () => {
  it("includes action source and app version", () => {
    const r = buildAvailabilityRequest(false, "toggle_tap");
    expect(r.is_available).toBe(false);
    expect(r.action_source).toBe("toggle_tap");
    expect(r.app_version).toBe("10.0.03");
  });
  it("refuses unknown sources", () => {
    expect(() => buildAvailabilityRequest(false, "app_resume" as any)).toThrow();
  });
  it("carries no actor identity", () => {
    const r = buildAvailabilityRequest(true, "toggle_tap") as Record<string, unknown>;
    expect(r.worker_id).toBeUndefined();
    expect(r.user_id).toBeUndefined();
  });
});
