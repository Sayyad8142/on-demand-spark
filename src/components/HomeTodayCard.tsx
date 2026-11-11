import { useMemo } from "react";
import { CalendarClock, CheckCircle2, IndianRupee, Wallet } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { displayText, serviceLabel, useWorkerLanguage } from "@/i18n/display";
import { useWorkerPayouts } from "@/hooks/useWorkerPayouts";
import { useHomeToday } from "@/hooks/useHomeToday";
import { todayMoney } from "@/lib/homeSummary";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function when(date: string | null, time: string | null): string {
  let d = "";
  if (date) {
    const p = parseISO(date);
    d = isToday(p) ? displayText("Today") : isTomorrow(p) ? displayText("Tomorrow") : format(p, "dd MMM");
  }
  let t = "";
  if (time) {
    const [h, m] = time.split(":");
    const hr = parseInt(h, 10);
    t = `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  }
  return [d, t].filter(Boolean).join(", ");
}

/** Today's money, jobs and next booking — server data only; a part is hidden when its data could not load. */
export default function HomeTodayCard({ workerId }: { workerId: string }) {
  useWorkerLanguage();
  const { payouts, loading: payLoading, error: payError } = useWorkerPayouts(workerId);
  const { completedToday, upcoming, loading } = useHomeToday(workerId);
  const money = useMemo(() => todayMoney(payouts), [payouts]);
  const next = upcoming?.[0];

  const Stat = ({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) => (
    <div className="rounded-xl bg-muted/60 p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold leading-tight">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );

  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <h2 className="text-base font-bold text-foreground">{displayText("Today")}</h2>
      <div className="grid grid-cols-2 gap-2">
        {!payError && <Stat icon={IndianRupee} label={displayText("Earned today")} value={payLoading ? "…" : inr(money.earned)} />}
        {!payError && <Stat icon={Wallet} label={displayText("Paid to you today")} value={payLoading ? "…" : inr(money.paid)} />}
        {completedToday !== null && <Stat icon={CheckCircle2} label={displayText("Jobs done today")} value={String(completedToday)} />}
        {upcoming !== null && <Stat icon={CalendarClock} label={displayText("Upcoming jobs")} value={String(upcoming.length)} />}
      </div>
      {upcoming !== null && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground">{displayText("Next Booking")}</p>
          {next ? (
            <p className="mt-1 text-sm font-bold text-foreground">
              {when(next.scheduled_date, next.scheduled_time)} · {serviceLabel(next.service_type)}
              {next.community ? <span className="font-medium text-muted-foreground"> · {next.community}</span> : null}
            </p>
          ) : (
            <p className="mt-1 text-sm font-medium text-foreground">{displayText("No bookings assigned yet.")}</p>
          )}
        </div>
      )}
      {loading && upcoming === null && completedToday === null && (
        <div className="h-10 rounded-xl bg-muted animate-pulse" />
      )}
    </Card>
  );
}
