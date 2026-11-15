import { useState } from "react";
import "@/i18n/nextBookingMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useNextBooking } from "@/hooks/useNextBooking";
import { displayText, displayLocale, serviceLabel, useWorkerLanguage } from "@/i18n/display";
import { NEXT_BOOKING_LIVE_ENABLED, type NextReason } from "@/lib/nextBooking";
import { previewVerificationEnabled } from "@/lib/nextBookingDiagnostic";
import NextBookingDiagnosticPanel from "@/components/NextBookingDiagnosticPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Zap } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const reasons: Record<NextReason, string> = {
  available: "Available", off: "Turn on availability to appear in this ranking.", busy: "You are busy with a booking.", no_slot: "You have no saved working hours for this slot.", inactive: "Your worker account is inactive.", unable: "Ranking data could not be verified. Try again.",
};
export default function NextBookingRanking() {
  useWorkerLanguage();
  const { user } = useAuth();
  const [community, setCommunity] = useState("");
  const [service, setService] = useState("");
  const [preview] = useState(previewVerificationEnabled);
  const { data, loading, error, retry, diagnostic } = useNextBooking(user?.id, community, service, NEXT_BOOKING_LIVE_ENABLED || preview);
  const time = (value: string) => new Date(value).toLocaleTimeString(displayLocale(), { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const message = loading ? "Checking availability…" : error === "disabled" ? "Next Booking is not enabled yet." : error === "auth" ? "Please sign in again." : error === "unavailable" ? "Ranking service is not available yet." : error === "invalid" ? "Ranking data could not be verified. Try again." : "Could not connect. Try again.";
  return <section className="space-y-4 py-3" aria-busy={loading}>
    <h2 className="text-lg font-bold">⚡ {displayText("Next Booking")}</h2>
    {data && <>
      <div className="grid grid-cols-2 gap-2">
        <Select value={data.community} onValueChange={setCommunity}>
          <SelectTrigger aria-label={displayText("Community")}><SelectValue /></SelectTrigger>
          <SelectContent>{data.communities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={data.service} onValueChange={setService}>
          <SelectTrigger aria-label={displayText("Service")}><SelectValue>{serviceLabel(data.service)}</SelectValue></SelectTrigger>
          <SelectContent>{data.services.map(s => <SelectItem key={s} value={s}>{serviceLabel(s)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-semibold">{time(data.slotStart)}–{time(data.slotEnd)}</span>
        <span className="text-muted-foreground">{displayText("Last updated")}: {time(data.updatedAt)}</span>
      </div>
      <p className="text-sm font-semibold" role="status">{displayText(reasons[data.reason])}{data.rows.find(r => r.isMe) ? ` · #${data.rows.find(r => r.isMe)?.rank}` : ""}</p>
      {data.rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{displayText("No available workers for this slot.")}</p>}
      <ol className="divide-y divide-border">
        {data.rows.map(row => <li key={row.rank} className={`flex items-center gap-3 py-3 ${row.isMe ? "bg-primary/10" : ""}`}>
          <span className="w-9 shrink-0 text-center text-sm font-bold">#{row.rank}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold">{row.name} {row.isMe && <span className="text-xs text-primary">{displayText("YOU")}</span>}</p>
            <span className="text-xs text-muted-foreground">{displayText("Available")}</span>
          </div>
          <div className="shrink-0 text-right text-xs">
            <span className="flex items-center justify-end gap-1"><Zap className="h-3 w-3 text-primary" aria-label={displayText("Priority Score")} />{row.priority}</span>
            <span className="mt-1 flex items-center justify-end gap-1"><Star className="h-3 w-3 text-primary" aria-label={displayText("Customer rating")} />{row.rating.toFixed(1)}</span>
          </div>
        </li>)}
      </ol>
    </>}
    {!data && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{displayText(message)}</p>}
    {!loading && (error === "connection" || error === "invalid" || data?.reason === "unable") && <div className="flex justify-center"><Button variant="outline" onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />{displayText("Retry")}</Button></div>}
    {preview && <NextBookingDiagnosticPanel diagnostic={diagnostic} loading={loading} />}
  </section>;
}