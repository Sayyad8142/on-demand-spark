import { describe, it, expect } from "vitest";
import { WORKER_BOOKING_COLUMNS } from "@/lib/workerBookingColumns";

describe("Worker booking reads", () => {
  it("never select completion_otp", () => {
    const cols = WORKER_BOOKING_COLUMNS.split(",");
    expect(cols).not.toContain("completion_otp");
    expect(cols).not.toContain("*");
    for (const needed of ["id", "status", "worker_id", "flat_no", "price_inr", "community", "started_at"]) {
      expect(cols).toContain(needed);
    }
  });
});
