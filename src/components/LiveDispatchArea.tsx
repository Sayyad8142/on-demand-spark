import "@/i18n/nextBookingMessages";
import { useEffect, useState } from "react";
import { displayText, serviceLabel, useWorkerLanguage } from "@/i18n/display";
import { dispatchAreaPresentation } from "@/lib/liveDispatchView";
import { prettyCode, type NextArea } from "@/lib/workerNextBooking";

const statusLabel = { offer_sent: "Offer Sent", next_batch: "Next Batch", in_line: "In Line", not_eligible: "Not Eligible", updating: "Position updating" } as const;

export default function LiveDispatchArea({ area, snapshotAt }: { area: NextArea; snapshotAt: string }) {
  useWorkerLanguage();
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const { status, view: current } = dispatchAreaPresentation(area, snapshotAt, now);
  return <li className="border border-border rounded-lg bg-card p-3 space-y-3">
    <div className="flex flex-wrap justify-between gap-2">
      <h3 className="text-sm font-semibold break-words">{prettyCode(area.community)} · {serviceLabel(area.service)}</h3>
      <p role="status" className="text-sm font-bold text-primary">{displayText(statusLabel[status])}</p>
    </div>
    {current?.ownGroup && <p className="text-sm">{displayText("Your group")}: {current.ownGroup}</p>}
    {current && current.offers.length > 0 && <div>
      <h4 className="text-xs font-semibold text-muted-foreground">{displayText("Offer Sent")}</h4>
      <ul className="mt-2 space-y-2">{current.offers.map((o, i) => <li key={i} className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="break-words">{o.name}{o.isMe ? ` · ${displayText("You")}` : ""}</span>
        <span className="text-xs text-muted-foreground">{displayText(o.receivedAt ? "Phone receipt confirmed" : "Phone receipt unconfirmed")}</span>
      </li>)}</ul>
    </div>}
    {current && current.batches.length > 0 && <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{displayText("Future positions are estimates")}</p>
      {current.batches.map(b => <div key={b.number}>
        <h4 className="text-xs font-semibold">{displayText(b.number === 1 ? "Next Batch" : "In Line")} · {displayText("Group")} {b.number} · {displayText("Batch size")} {b.size}</h4>
        <ol className="mt-2 space-y-1 text-sm">{b.workers.map((w, i) => <li key={i} className="break-words">{w.name}{w.isMe ? ` · ${displayText("You")}` : ""}</li>)}</ol>
      </div>)}
    </div>}
  </li>;
}