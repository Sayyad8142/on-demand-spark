/**
 * Hybrid payout UI building blocks. NOT CONNECTED to production data:
 * nothing imports these into a screen while HYBRID_PAYOUT_UI_ENABLED is false.
 * They render only the props they are given.
 */
import { useState } from "react";
import { ChevronDown, Zap, CalendarClock, Clock, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { displayText, displayLocale, useWorkerLanguage } from "@/i18n/display";
import { mapPayoutStatus } from "@/lib/payoutDisplay";
import { PayoutStatusBadge } from "@/components/payouts/PayoutStatusBadge";
import {
  normalizeInstantProgress, instantSlotsExhausted, consolidatedMatches,
  type InstantProgressView, type DailyScheduleView, type ConsolidatedPayoutView, type ManualPayoutView,
} from "@/lib/hybridPayout";

const istTime = (iso: string) =>
  new Date(iso).toLocaleString(displayLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function InstantPayoutProgress(props: InstantProgressView) {
  useWorkerLanguage();
  const v = normalizeInstantProgress(props);
  if (instantSlotsExhausted(v)) return null; // Daily schedule card takes over.
  return (
    <Card data-testid="instant-progress">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 font-semibold"><Zap className="h-4 w-4 text-primary" />{displayText("Instant payout")}</div>
        <Progress value={v.slotsTotal ? (v.slotsAllocated / v.slotsTotal) * 100 : 0} />
        <p className="text-sm">{displayText("{{used}} of {{total}} instant payouts used", { used: v.slotsAllocated, total: v.slotsTotal })}</p>
        <p className="text-xs text-muted-foreground">{displayText("{{paid}} paid successfully", { paid: v.slotsSettled })}</p>
      </CardContent>
    </Card>
  );
}

export function DailyPayoutSchedule({ nextPayoutAt, transfersActive }: DailyScheduleView) {
  useWorkerLanguage();
  return (
    <Card data-testid="daily-schedule">
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-primary" />{displayText("Daily Payout — 7:00 PM IST")}</div>
        {nextPayoutAt && <p className="text-sm">{displayText("Next payout:")} {istTime(nextPayoutAt)}</p>}
        {!transfersActive && (
          <p className="text-xs text-muted-foreground">{displayText("Bank transfers are paused. Didi Now will pay you; status shows Paid only after it is confirmed.")}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PendingEarningsCard({ today, awaiting, processing, paid }: { today: number; awaiting: number; processing: number; paid: number }) {
  useWorkerLanguage();
  const cells: [string, number][] = [["Today's Earnings", today], ["Awaiting payout", awaiting], ["Processing", processing], ["Paid", paid]];
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="pending-earnings">
      {cells.map(([label, amt]) => (
        <Card key={label} className="p-3 text-center">
          <p className="text-lg font-bold">₹{amt}</p>
          <p className="text-[11px] text-muted-foreground">{displayText(label)}</p>
        </Card>
      ))}
    </div>
  );
}

export function ConsolidatedPayoutItem({ payout }: { payout: ConsolidatedPayoutView }) {
  useWorkerLanguage();
  const [open, setOpen] = useState(false);
  const state = mapPayoutStatus(payout.status, payout.paidAt);
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="text-left">
            <span className="block text-lg font-bold">₹{payout.amount}</span>
            <span className="text-xs text-muted-foreground">
              {payout.kind === "daily" ? displayText("Daily payout") : displayText("Instant payout")} · {displayText("{{count}} bookings", { count: payout.bookings.length })}
            </span>
          </span>
          <span className="flex items-center gap-1"><PayoutStatusBadge state={state} /><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} /></span>
        </button>
        {state === "paid" && payout.reference && <p className="text-xs text-muted-foreground">{displayText("Reference No.")} {payout.reference}</p>}
        {(state === "failed" || state === "reversed") && payout.failureReason && <p className="text-xs text-destructive">{displayText("Reason:")} {payout.failureReason}</p>}
        {!consolidatedMatches(payout) && <p className="text-xs text-warning">{displayText("Amounts are being checked by Didi Now")}</p>}
        {open && (
          <ul className="space-y-1 border-t pt-2 text-xs">
            {payout.bookings.map((b) => (
              <li key={b.bookingId} className="flex justify-between"><span className="font-mono">#{b.bookingId.slice(0, 8)}</span><span>₹{b.amount}</span></li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ManualPayoutConfirmation({ amount, paidAt, reference, verified }: ManualPayoutView) {
  useWorkerLanguage();
  return (
    <Card data-testid="manual-payout">
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {verified ? <ShieldCheck className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-warning" />}
          {verified ? displayText("Paid by Didi Now team") : displayText("Manual payment being verified")}
        </div>
        <p className="text-lg font-bold">₹{amount}</p>
        <p className="text-xs text-muted-foreground">{istTime(paidAt)}</p>
        {verified && reference && <p className="text-xs text-muted-foreground">{displayText("Reference No.")} {reference}</p>}
      </CardContent>
    </Card>
  );
}
