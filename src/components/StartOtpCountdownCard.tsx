import { KeyRound, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayText } from "@/i18n/display";
import { timerLabel, type StartTimer } from "@/lib/bookingCardDetails";
import "@/i18n/lateStartMessages";
import { lateStartNotice, type LateStartPriority } from "@/lib/lateStartPriority";

const TONE = {
  green: { text: "text-success", bar: "bg-success" },
  orange: { text: "text-warning", bar: "bg-warning" },
  red: { text: "text-destructive", bar: "bg-destructive" },
} as const;

/** Display-only countdown; the button only opens the existing Start OTP screen. */
export default function StartOtpCountdownCard({ timer, onStart, disabled, updating, priority }: {
  timer: StartTimer | null; onStart: () => void; disabled?: boolean; updating?: boolean; priority?: LateStartPriority | null;
}) {
  const tone = TONE[timer?.tone ?? "green"];
  const notice = timer ? lateStartNotice(priority, timer.overdue) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      {timer && (
        <div role="timer" aria-live="off" className="mb-3 text-center">
          <p className={`flex items-center justify-center gap-1.5 text-sm font-semibold ${timer.overdue ? "text-destructive" : "text-muted-foreground"}`}>
            {timer.overdue && <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            {displayText(timer.overdue ? "Start Time Overdue" : "Time Left to Start Booking")}
          </p>
          <p className={`mt-1 font-mono text-5xl font-extrabold tabular-nums tracking-tight ${tone.text}`}>
            {timer.overdue && "+"}{timerLabel(timer.seconds)}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${tone.bar}`} style={{ width: `${timer.progress * 100}%` }} />
          </div>
        </div>
      )}
      {notice && <p role="status" className={`mb-3 text-sm leading-snug ${notice.kind === "confirmed" ? "text-destructive" : "text-warning"}`}>
        {displayText(notice.kind === "confirmed" ? "−{{points}} Priority Points: Start OTP delayed." : "Start your booking within 10 minutes to avoid losing {{points}} priority points.", { points: notice.points })}
      </p>}
      <Button
        size="lg"
        variant="bookingStart"
        className="h-14 w-full rounded-xl px-3 text-base font-bold whitespace-normal leading-snug"
        onClick={onStart}
        disabled={disabled}
        aria-busy={updating}>
        {updating ? displayText("Updating...") : <><KeyRound aria-hidden="true" /><span className="min-w-0 break-words">{displayText("Start Booking • Enter OTP")}</span></>}
      </Button>
    </div>
  );
}
