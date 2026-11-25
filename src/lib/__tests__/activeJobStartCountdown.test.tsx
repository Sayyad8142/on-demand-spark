import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import ActiveJobCard from "@/components/ActiveJobCard";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/i18n/display", () => ({ displayText: (text: string) => text, useWorkerLanguage: () => "en", serviceLabel: (text: string) => text }));
vi.mock("react-i18next", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-i18next")>(),
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
vi.mock("@/hooks/useCommunityFee", () => ({ useCommunityFee: () => ({ breakdown: { netPayout: 0 } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/PaymentCollectionModal", () => ({ default: () => null }));
vi.mock("@/components/DishwashingTrainingCarousel", () => ({ default: () => null }));
vi.mock("@/lib/serviceTraining", () => ({ serviceTrainingSlides: () => [], serviceTrainingFallback: () => null }));
vi.mock("@/lib/flatVoice", () => ({ announceFlat: vi.fn(), buildFlatAnnouncement: () => ({ text: "", lang: "en" }) }));
vi.mock("@/lib/otpV2", () => ({ isOtpV2ClientEnabled: () => false, getCachedOtpMode: () => null, getOtpCardAction: () => "complete" }));

const accepted = Date.parse("2026-11-25T08:00:00Z");
// Only fields this display test reads; unrelated nullable database columns are omitted.
const booking = {
  id: "countdown-test", status: "accepted", start_otp_required: true,
  accepted_at: new Date(accepted).toISOString(), started_at: null,
  service_type: "maid", flat_no: "9198", price_inr: 0,
} as ComponentProps<typeof ActiveJobCard>["booking"];
const show = (changes: Partial<typeof booking> = {}) => render(
  <ActiveJobCard booking={{ ...booking, ...changes }} updating={false} onStatusUpdate={vi.fn()} />,
);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(accepted); navigate.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("real ActiveJobCard Start countdown integration", () => {
  it("recomputes the server deadline on each one-second tick", () => {
    show();
    expect(screen.getByRole("timer").textContent).toBe("10:00");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer").textContent).toBe("09:59");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer").textContent).toBe("09:58");
  });
  it("continues beyond 00:00 without resetting on remount", () => {
    vi.setSystemTime(accepted + 599_000);
    const card = show();
    expect(screen.getByRole("timer").textContent).toBe("00:01");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer").textContent).toBe("+00:00");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("timer").textContent).toBe("+00:02");
    card.unmount();
    vi.setSystemTime(accepted + 675_000);
    show();
    expect(screen.getByRole("timer").textContent).toBe("+01:15");
  });
  it("opens the existing Start OTP route even when overdue", () => {
    vi.setSystemTime(accepted + 675_000);
    show();
    fireEvent.click(screen.getByRole("button", { name: /Start Booking/ }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/start-booking/countdown-test");
  });
  it("keeps an unflagged booking on the existing Complete with OTP route", () => {
    show({ start_otp_required: false });
    fireEvent.click(screen.getByRole("button", { name: /Complete with OTP/ }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/complete-booking/countdown-test");
    expect(screen.queryByRole("timer")).toBeNull();
  });
  it("uses the existing Complete route after server-confirmed Start", () => {
    show({ status: "started", started_at: new Date(accepted + 10_000).toISOString() });
    fireEvent.click(screen.getByRole("button", { name: /Complete with OTP/ }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/complete-booking/countdown-test");
    expect(screen.queryByRole("timer")).toBeNull();
  });
});