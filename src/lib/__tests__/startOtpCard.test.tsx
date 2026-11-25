import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StartOtpCountdownCard from "@/components/StartOtpCountdownCard";
import { startOtpTimer } from "../bookingCardDetails";

vi.mock("@/i18n/display", () => ({ displayText: (text: string) => text }));
afterEach(cleanup);

describe("Start OTP card navigation", () => {
  it("opens the existing OTP flow after the ten-minute deadline", () => {
    const onStart = vi.fn();
    const accepted = Date.parse("2026-11-25T08:00:00Z");
    const timer = startOtpTimer({ id: "b1", status: "accepted", start_otp_required: true,
      started_at: null, accepted_at: new Date(accepted).toISOString() }, accepted + 675_000);
    expect(timer).toMatchObject({ overdue: true, seconds: 75 });
    render(<StartOtpCountdownCard timer={timer} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it("still respects the existing disabled guard", () => {
    const onStart = vi.fn();
    render(<StartOtpCountdownCard timer={{ overdue: true, seconds: 75, progress: 0, tone: "red" }} onStart={onStart} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onStart).not.toHaveBeenCalled();
  });
});