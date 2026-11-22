import "@/i18n/nextBookingMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useNextBooking } from "@/hooks/useNextBooking";
import { displayText, displayLocale, serviceLabel, useWorkerLanguage } from "@/i18n/display";
import { NEXT_BOOKING_LIVE_ENABLED } from "@/lib/nextBooking";
import LiveDispatchArea from "@/components/LiveDispatchArea";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NextBookingRanking() {
  useWorkerLanguage();
  const { user } = useAuth();
  // No localhost/preview auto-activation. Owner approval and hosted parity are required.
  const { data, loading, error, retry } = useNextBooking(user?.id, "", "", NEXT_BOOKING_LIVE_ENABLED);
  const time = (value: string) => new Date(value).toLocaleTimeString(displayLocale(), { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const message = error === "auth" ? "Please sign in again." : "Position updating";
  return <section className="space-y-4 py-3" aria-busy={loading}>
    <h2 className="text-lg font-bold">{displayText("Next Booking — Live Dispatch Order")}</h2>
    {data && <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{displayText("Last updated")}: {time(data.snapshotAt)}</span>
      </div>
      {data.areas.length === 0
        ? <p className="py-8 text-center text-sm text-muted-foreground">{displayText("You are not set up for any community or service yet.")}</p>
        : <ul className="space-y-2">{data.areas.map(a => <LiveDispatchArea key={`${a.community}/${a.service}`} area={a} snapshotAt={data.snapshotAt} />)}</ul>}
    </>}
    {!data && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{displayText(message)}</p>}
    {!loading && (data || error === "connection" || error === "invalid" || error === "unavailable") && <div className="flex justify-center"><Button variant="outline" onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />{displayText(data ? "Refresh" : "Retry")}</Button></div>}
  </section>;
}
