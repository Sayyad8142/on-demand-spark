import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const h = vi.hoisted(() => ({ scan: vi.fn(), otp: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/passbookScan", () => ({ hasNativePassbookScanner: () => true, scanPassbook: h.scan }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: { collect_worker_upi: false }, error: null }), auth: { signInWithOtp: h.otp } } }));
vi.mock("@/components/CommunityPicker", () => ({ CommunityPicker: ({ onChange }: { onChange: (value: string) => void }) => <select aria-label="Community" onChange={e => onChange(e.target.value)}><option value="">Choose</option><option value="phf">PHF</option></select> }));
import Auth from "@/pages/Auth";
const fields = { holder: "Asha Rao", account: "123456789012", ifsc: "HDFC0001234", bankName: "HDFC Bank" };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); h.scan.mockResolvedValue(fields); });
afterEach(cleanup);
async function open() {
  const view = render(<MemoryRouter><Auth /></MemoryRouter>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Sign Up" }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(view.container.querySelector("#signup-name")).not.toBeNull());
  const input = (id: string) => { const element = view.container.querySelector<HTMLInputElement>(`#${id}`); if (!element) throw new Error(id); return element; };
  fireEvent.change(input("signup-name"), { target: { value: "Asha Rao" } });
  fireEvent.change(input("signup-phone"), { target: { value: "9876543210" } });
  fireEvent.change(screen.getByLabelText("Community"), { target: { value: "phf" } });
  fireEvent.click(screen.getByRole("button", { name: /Maid/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return input;
}
describe("new-worker passbook review", () => {
  it("fills signup fields locally but requires manual confirmation before continuing", async () => {
    const input = await open();
    fireEvent.click(screen.getByRole("button", { name: "Upload from Gallery" }));
    await waitFor(() => expect(input("signup-acct-no")).toHaveValue(fields.account));
    expect(input("signup-acct-name")).toHaveValue(fields.holder);
    expect(input("signup-ifsc")).toHaveValue(fields.ifsc);
    expect(input("signup-bank-name")).toHaveValue(fields.bankName);
    expect(input("signup-acct-no-confirm")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(h.otp).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Upload from Gallery" })).toBeInTheDocument();
    fireEvent.change(input("signup-acct-no-confirm"), { target: { value: fields.account } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Send OTP" })).toBeInTheDocument();
    const saved = JSON.stringify(localStorage);
    expect(saved).not.toContain(fields.account);
    expect(saved).not.toContain(fields.ifsc);
  });
  it("preserves manual entries and prevents leaving the bank step during OCR", async () => {
    let resolve: (value: typeof fields) => void = () => {};
    h.scan.mockReturnValue(new Promise(r => { resolve = r; }));
    const input = await open();
    fireEvent.change(input("signup-acct-name"), { target: { value: "Manual Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Confirm$/ }));
    expect(screen.getByRole("button", { name: "Take Photo" })).toBeInTheDocument();
    resolve(fields);
    await waitFor(() => expect(input("signup-acct-no")).toHaveValue(fields.account));
    expect(input("signup-acct-name")).toHaveValue("Manual Name");
    expect(input("signup-acct-no-confirm")).toHaveValue("");
  });
});