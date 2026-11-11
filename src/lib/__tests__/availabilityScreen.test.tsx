import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const upserts: unknown[] = [];
const spoken: string[] = [];
let finishSpeech: (() => void) | null = null;
const stopSpy = vi.fn();

const authValue = { user: { id: "w1" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authValue }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/BottomNav", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { id: "w1", service_types: ["maid"] }, error: null }),
      order: async () => ({ data: [{ day_of_week: 0, slots: ["07:00:00", "07:30:00"] }], error: null }),
      upsert: async (rows: unknown, opts: unknown) => { upserts.push({ table, rows, opts }); return { error: null }; },
    };
    return q;
  };
  return { supabase: { from: chain, rpc: async () => ({ error: null }) } };
});
vi.mock("@/lib/availabilityVoice", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    defaultGuideEngines: () => [{
      isSupported: async () => true,
      speak: (text: string) => { spoken.push(text); return new Promise<void>((r) => { finishSpeech = r; }); },
      stop: () => { stopSpy(); finishSpeech?.(); },
    }],
  };
});

import i18n from "@/i18n/config";
import Availability from "@/pages/Availability";
import { AVAILABILITY_GUIDE } from "@/lib/availabilityVoice";

function renderScreen() {
  return render(<MemoryRouter initialEntries={["/availability"]}><Availability /></MemoryRouter>);
}

describe("Availability screen: simpler words + voice help", () => {
  beforeEach(async () => {
    upserts.length = 0; spoken.length = 0; stopSpy.mockClear();
    await i18n.changeLanguage("en");
  });

  it("shows the new labels and saves exactly the same data as before", async () => {
    renderScreen();
    await screen.findByText("When Can You Work?");
    fireEvent.click(screen.getByText("MON"));
    expect(screen.getByText("2 Times Selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Full Day"));
    expect(screen.getByText("24 Times Selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Remove All"));
    expect(screen.getByText("0 Times Selected")).toBeTruthy();
    fireEvent.click(screen.getByText("7:00 AM"));
    fireEvent.click(screen.getByText("Same for Every Day"));
    fireEvent.click(screen.getByText("Save My Working Time"));
    await waitFor(() => expect(upserts).toHaveLength(1));
    const { table, rows, opts } = upserts[0] as any;
    expect(table).toBe("worker_availability");
    expect(opts).toEqual({ onConflict: "worker_id,day_of_week", ignoreDuplicates: false });
    expect(rows).toHaveLength(7);
    for (let d = 0; d < 7; d++) expect(rows[d]).toEqual({ worker_id: "w1", day_of_week: d, slots: ["07:00:00"] });
  });

  it("never speaks on open; tap speaks in the app language, second tap stops, leaving stops", async () => {
    await i18n.changeLanguage("te");
    const view = renderScreen();
    await screen.findByText("మీరు ఎప్పుడు పని చేయగలరు?");
    expect(spoken).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "సూచనలు వినండి" }));
    await waitFor(() => expect(spoken).toEqual([AVAILABILITY_GUIDE.te]));
    const stopBtn = await screen.findByRole("button", { name: "వాయిస్ ఆపండి" });
    fireEvent.click(stopBtn);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    fireEvent.click(await screen.findByRole("button", { name: "సూచనలు వినండి" }));
    await waitFor(() => expect(spoken).toHaveLength(2));
    act(() => view.unmount());
    expect(stopSpy).toHaveBeenCalledTimes(2);
  });
});
