import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ scan: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/passbookScan", () => ({ hasNativePassbookScanner: () => true, scanPassbook: mocks.scan }));
vi.mock("@/lib/bankSelfService", () => ({ submitMyBankDetails: mocks.submit, SUBMIT_BANK_ERRORS: { unavailable: "Adding bank details in the app opens soon. Please call manager for now." } }));
import { BankDetailsForm } from "@/components/bank/BankDetailsForm";

const fields = { holder: "Asha Rao", account: "123456789012", ifsc: "HDFC0001234", bankName: "HDFC Bank" };
beforeEach(() => { vi.clearAllMocks(); mocks.scan.mockResolvedValue(fields); mocks.submit.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe("scan review and bank submission", () => {
  const scan = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    await waitFor(() => expect(screen.getByLabelText("Bank account number")).toHaveValue(fields.account));
  };
  it("does not submit a scanned account without manually typed confirmation", async () => {
    render(<BankDetailsForm onSubmitted={vi.fn()} />);
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Submit bank details" }));
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("submits only reviewed corrected values, not an image or OCR verification flag", async () => {
    const done = vi.fn(); render(<BankDetailsForm onSubmitted={done} />);
    await scan();
    fireEvent.change(screen.getByLabelText("Bank account number"), { target: { value: "987654321012" } });
    fireEvent.change(screen.getByLabelText("Confirm account number"), { target: { value: "987654321012" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit bank details" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(mocks.submit).toHaveBeenCalledWith({ ...fields, account: "987654321012", confirmation: "987654321012" });
  });
  it("leaves manual entry usable during scan and preserves newly typed data", async () => {
    let resolve: (value: typeof fields) => void = () => {};
    mocks.scan.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<BankDetailsForm onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    fireEvent.change(screen.getByLabelText("Account holder name"), { target: { value: "Manual Name" } });
    resolve(fields);
    await waitFor(() => expect(screen.getByLabelText("Bank account number")).toHaveValue(fields.account));
    expect(screen.getByLabelText("Account holder name")).toHaveValue("Manual Name");
    expect(mocks.scan).toHaveBeenCalledOnce();
  });
  it("does not turn OCR into bank verification when Admin submission is unavailable", async () => {
    mocks.submit.mockResolvedValue({ ok: false, error: "unavailable" });
    const done = vi.fn(); render(<BankDetailsForm onSubmitted={done} />);
    await scan();
    fireEvent.change(screen.getByLabelText("Confirm account number"), { target: { value: fields.account } });
    fireEvent.click(screen.getByRole("button", { name: "Submit bank details" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Bank account number")).toHaveValue(fields.account);
  });
  it("keeps typed bank values when scanning fails", async () => {
    mocks.scan.mockRejectedValue(new Error("scan_failed"));
    render(<BankDetailsForm onSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Bank account number"), { target: { value: fields.account } });
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Take Photo" })).not.toBeDisabled());
    expect(screen.getByLabelText("Bank account number")).toHaveValue(fields.account);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});