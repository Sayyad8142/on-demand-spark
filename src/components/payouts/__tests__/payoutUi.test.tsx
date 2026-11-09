import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { PayoutStatusBadge } from "../PayoutStatusBadge";
import { DailyPayoutSchedule } from "../hybrid/HybridPayoutCards";

describe("payout UI", () => {
  it("badge shows Awaiting payout for an unconfirmed paid row", () => {
    render(<PayoutStatusBadge state="awaiting" />);
    expect(screen.getByText("Awaiting payout")).toBeTruthy();
  });
  it("daily schedule warns that bank transfers are paused", () => {
    render(<DailyPayoutSchedule nextPayoutAt={null} transfersActive={false} />);
    expect(screen.getByText(/Bank transfers are paused/)).toBeTruthy();
  });
  it("receipt no longer promises 24 hours or says Customer Paid", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../pages/CompleteBooking.tsx"), "utf8");
    expect(src).not.toMatch(/Within 24 hours/);
    expect(src).not.toMatch(/Customer Paid/);
  });
  it("hybrid components are not used by any screen yet", () => {
    const pages = path.resolve(__dirname, "../../../pages");
    for (const f of fs.readdirSync(pages)) {
      expect(fs.readFileSync(path.join(pages, f), "utf8")).not.toMatch(/hybrid\/HybridPayoutCards/);
    }
  });
});
