import { describe, it, expect } from "vitest";
import { startOtpCardAction, mustStartFirst, canShowStartButton } from "@/lib/startOtp";
import { getOtpCardAction } from "@/lib/otpV2";
import { CURRENT_VERSION_CODE, CURRENT_VERSION_NAME } from "@/config/version";

// Regression: Start OTP must not change the End OTP flow for unflagged bookings.
describe("Start OTP / Completion OTP compatibility", () => {
  it("flagged booking: accepted shows Start, started shows Complete", () => {
    expect(startOtpCardAction("accepted")).toBe("start");
    expect(startOtpCardAction("on_the_way")).toBe("start");
    expect(startOtpCardAction("started")).toBe("complete");
  });

  it("flagged booking cannot open Complete before start", () => {
    expect(mustStartFirst(true, "accepted")).toBe(true);
    expect(mustStartFirst(true, "started")).toBe(false);
  });

  it("unflagged booking never requires Start and keeps legacy Complete", () => {
    for (const s of ["assigned", "accepted", "on_the_way", "started"]) {
      expect(mustStartFirst(false, s)).toBe(false);
      expect(mustStartFirst(null, s)).toBe(false);
      expect(canShowStartButton(false, s)).toBe(false);
    }
    expect(getOtpCardAction({ v2Enabled: false, mode: "legacy", status: "accepted" })).toBe("complete");
  });

  it("finished bookings show no OTP action", () => {
    expect(startOtpCardAction("completed")).toBe("none");
    expect(startOtpCardAction("cancelled")).toBe("none");
  });

  it("release build is 10.0.03 / 103", () => {
    expect(CURRENT_VERSION_CODE).toBe(103);
    expect(CURRENT_VERSION_NAME).toBe("10.0.03");
  });
});
