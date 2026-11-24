import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ back: undefined as (() => void) | undefined, open: vi.fn(), remove: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android", isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn((_event, callback) => { native.back = callback; return Promise.resolve({ remove: native.remove }); }) } }));
vi.mock("@/lib/workerStore", () => ({ openWorkerStore: native.open }));
import "@/i18n/config";
import { WorkerUpdateScreen } from "./WorkerUpdateScreen";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("update screen actions", () => {
  it('mandatory support opens the requested dialer target', () => {
    render(<WorkerUpdateScreen mandatory />);
    expect(screen.getByRole('link', { name: 'Call Support' })).toHaveAttribute('href', 'tel:8008180018');
  });
  it("optional Android Back dismisses through the existing snooze callback", async () => {
    const dismiss = vi.fn();
    render(<WorkerUpdateScreen mandatory={false} onDismiss={dismiss} />);
    await waitFor(() => expect(native.back).toBeTypeOf("function"));
    act(() => native.back?.());
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it("mandatory Back and Escape cannot dismiss", async () => {
    const dismiss = vi.fn();
    render(<WorkerUpdateScreen mandatory onDismiss={dismiss} />);
    await waitFor(() => expect(native.back).toBeTypeOf("function"));
    act(() => native.back?.());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dismiss).not.toHaveBeenCalled();
  });
  it("pending Store opening ignores repeat taps and blurs any prior input", async () => {
    let finish: (() => void) | undefined;
    native.open.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<WorkerUpdateScreen mandatory />);
    const button = screen.getByRole("button", { name: "Update Now" });
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(native.open).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(button);
    await act(async () => finish?.());
    expect(button).not.toBeDisabled();
  });
});