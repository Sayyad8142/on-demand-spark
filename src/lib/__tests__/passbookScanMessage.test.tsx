import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ scan: vi.fn() }));
vi.mock("@/lib/passbookScan", () => ({ hasNativePassbookScanner: () => true, scanPassbook: mocks.scan }));
import { BankDetailsForm } from "@/components/bank/BankDetailsForm";
const { fieldsFromReadings } = await vi.importActual<typeof import("@/lib/passbookScan")>("@/lib/passbookScan");
afterEach(cleanup);

describe("partial scan results", () => {
  const scanWith = async (fields: object) => {
    mocks.scan.mockResolvedValue(fields);
    render(<BankDetailsForm onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
  };
  it("fills the three readable fields and says 3 of 4 were detected", async () => {
    await scanWith({ holder: "", account: "50100123456789", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
    expect(await screen.findByText("3 of 4 bank details detected. Please complete the remaining details.")).toBeInTheDocument();
    expect(screen.getByLabelText("IFSC code")).toHaveValue("HDFC0001234");
    expect(screen.getByLabelText("Confirm account number")).toHaveValue("");
  });
  it("fills a single readable field instead of rejecting the scan", async () => {
    await scanWith({ holder: "", account: "", ifsc: "HDFC0001234", bankName: "" });
    expect(await screen.findByText("1 of 4 bank details detected. Please complete the remaining details.")).toBeInTheDocument();
    expect(screen.getByLabelText("IFSC code")).toHaveValue("HDFC0001234");
  });
  it("shows a scan failure only when nothing was read", async () => {
    await scanWith({ holder: "", account: "", ifsc: "", bankName: "" });
    expect(await screen.findByText("No bank details could be read. Retake a clear photo or enter the details manually.")).toBeInTheDocument();
  });
});

describe("native phone readings", () => {
  it("combines the normal and high-contrast readings field by field", () => {
    expect(fieldsFromReadings(["IFSC: HDFC0001234\nHDFC BANK", "Account No: 50100123456789\nIFSC: HDFC0001234"]))
      .toEqual({ holder: "", account: "50100123456789", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
  });
});
