import { useState } from "react";
import "@/i18n/nextBookingMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useNextBooking } from "@/hooks/useNextBooking";
import { displayText, displayLocale, serviceLabel, useWorkerLanguage } from "@/i18n/display";
import { NEXT_BOOKING_LIVE_ENABLED } from "@/lib/nextBooking";
import { previewVerificationEnabled } from "@/lib/nextBookingDiagnostic";
import { areaPosition, prettyCode, type NextArea } from "@/lib/workerNextBooking";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const reasonText: Record<string, string> = {
  notifications_off: "Turn on booking notifications to join the line.",
  availability_off: "Turn on availability to join the line.",
  offline: "Turn on availability to join the line.",
  no_slot: "You have no saved working hours for this slot.",
  busy: "You are busy with a booking.",
  inactive: "Your worker account is inactive.",
  blocked: "Your worker account is inactive.",
};
const modeText: Record<string, string> = { longest_waiting: "Order: longest waiting first" };

function AreaCard({ area }: { area: NextArea }) {
  const pos = areaPosition(area);
  return <li className="rounded-lg border border-border bg-card p-3">
    <p className="text-sm font-semibold break-words">{prettyCode(area.community)} · {serviceLabel(area.service)}</p>
    {pos.kind === "next" && <p className="mt-1 text-base font-bold text-primary">{displayText("You are in the next group")}</p>}
    {pos.kind === "line" && <p className="mt-1 text-base font-bold">{displayText("In line")}: {displayText("{{count}} groups ahead of you", { count: pos.ahead })}</p>}
    {pos.kind === "none" && <p className="mt-1 text-sm text-muted-foreground">
      {area.reason && reasonText[area.reason] ? displayText(reasonText[area.reason]) : displayText("You are not in the line right now.")}
    </p>}
    {pos.kind !== "none" && area.boundaryTie && <p className="mt-1 text-xs text-muted-foreground">{displayText("Tied with other workers at the group boundary.")}</p>}
  </li>;
}

export default function NextBookingRanking() {
  useWorkerLanguage();
  const { user } = useAuth();
  const [preview] = useState(previewVerificationEnabled);
  const { data, loading, error, retry } = useNextBooking(user?.id, "", "", NEXT_BOOKING_LIVE_ENABLED || preview);
  const time = (value: string) => new Date(value).toLocaleTimeString(displayLocale(), { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const message = loading ? "Checking availability…" : error === "disabled" ? "Next Booking is not enabled yet." : error === "auth" ? "Please sign in again." : error === "unavailable" ? "Ranking service is not available yet." : error === "invalid" ? "Ranking data could not be verified. Try again." : "Could not connect. Try again.";
  return <section className="space-y-4 py-3" aria-busy={loading}>
    <h2 className="text-lg font-bold">⚡ {displayText("Next Booking")}</h2>
    {data && <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{displayText("Last updated")}: {time(data.snapshotAt)}</span>
        {data.rankingMode && <span>{modeText[data.rankingMode] ? displayText(modeText[data.rankingMode]) : prettyCode(data.rankingMode)}</span>}
      </div>
      <p className="text-xs font-semibold text-muted-foreground">{displayText("Estimate only — your place can change.")} {displayText("Not confirmed to match the live booking order.")}</p>
      {data.areas.length === 0
        ? <p className="py-8 text-center text-sm text-muted-foreground">{displayText("You are not set up for any community or service yet.")}</p>
        : <ul className="space-y-2">{data.areas.map(a => <AreaCard key={`${a.community}/${a.service}`} area={a} />)}</ul>}
    </>}
    {!data && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{displayText(message)}</p>}
    {!loading && (data || error === "connection" || error === "invalid" || error === "unavailable") && <div className="flex justify-center"><Button variant="outline" onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />{displayText(data ? "Refresh" : "Retry")}</Button></div>}
  </section>;
}
