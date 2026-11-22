// STAGED ONLY. Replace Admin's src/components/bookings/DispatchPoolPanel.tsx after approval.
// Place recordedDispatch.ts under Admin src/lib. Not a Worker component or a sender.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { recordedDispatch, type RecordedWave } from "@/lib/recordedDispatch";

export default function DispatchPoolPanel({ bookingId, offeredIds }: { bookingId: string; offeredIds: Set<string> }) {
  const [waves, setWaves] = useState<RecordedWave[] | null>(null);
  const [failed, setFailed] = useState(false);
  const changeKey = [...offeredIds].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    setWaves(null); setFailed(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_booking_dispatch_audit", { p_booking_id: bookingId });
        if (error) throw error;
        const result = recordedDispatch(data);
        if (!cancelled) setWaves(result);
      } catch { if (!cancelled) { setWaves(null); setFailed(true); } }
    })();
    return () => { cancelled = true; };
  }, [bookingId, changeKey]);
  if (failed) return <p role="status">Dispatch records could not be verified.</p>;
  if (waves === null) return <p role="status">Loading dispatch records…</p>;
  return <section aria-label="Recorded dispatch batches" className="space-y-3">
    <h3 className="font-semibold">Recorded dispatch batches</h3>
    {!waves.length && <p>No recorded dispatch yet.</p>}
    {waves.map((wave, index) => <div key={`${wave.attempt}-${index}`}>
      <h4 className="text-sm font-medium">Batch {wave.attempt} · eligible {wave.eligible ?? "—"} · selected {wave.selected ?? "—"}</h4>
      <ol className="space-y-1">{wave.offers.map(offer => <li key={`${offer.workerId}-${offer.sequence}`} className="text-sm">
        {offer.sequence}. {offer.workerName} · {offer.status} · {new Date(offer.offeredAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
      </li>)}</ol>
    </div>)}
    <p className="text-sm text-muted-foreground">No future booking position is verified here.</p>
  </section>;
}