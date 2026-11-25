import { useEffect, useRef, useState } from "react";
import { KeyRound, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayText } from "@/i18n/display";
import { timerLabel, type StartTimer } from "@/lib/bookingCardDetails";
import "@/i18n/lateStartMessages";
import { lateStartNotice, type LateStartPriority } from "@/lib/lateStartPriority";

/** Display-only countdown; the button only opens the existing Start OTP screen. */
export default function StartOtpCountdownCard({ timer, onStart, disabled, updating, priority }: {
  timer: StartTimer | null; onStart: () => void; disabled?: boolean; updating?: boolean; priority?: LateStartPriority | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(350);
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const measure = () => setWidth(button.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  const notice = timer ? lateStartNotice(priority, timer.overdue) : null;
  return (
    <div>
      <Button
        ref={buttonRef}
        size="lg"
        variant="bookingStart"
        className={`start-otp-card start-otp-tone-${timer?.tone ?? "green"} relative h-[88px] w-full flex-col gap-2 rounded-xl px-4 text-base font-bold whitespace-normal leading-snug`}
        onClick={onStart}
        disabled={disabled}
        aria-busy={updating}>
        {timer && <svg className="start-otp-perimeter absolute inset-0" width="100%" height="88" aria-hidden="true">
          <rect className="start-otp-track" x="2" y="2" width={Math.max(0, width - 4)} height="84" rx="10" pathLength="100" />
          <rect className={`start-otp-progress${timer.overdue ? " start-otp-overdue" : ""}`} x="2" y="2" width={Math.max(0, width - 4)} height="84" rx="10" pathLength="100"
            strokeDasharray={`${timer.overdue ? 100 : Math.max(0, Math.min(1, timer.progress)) * 100} 100`} />
        </svg>}
        <span className="relative flex max-w-full items-center justify-center gap-2">
          <KeyRound aria-hidden="true" />
          <span className="min-w-0 break-words">{displayText(updating ? "Updating..." : "Start Booking • Enter OTP")}</span>
        </span>
        {timer && <span role="timer" aria-live="off" className="start-otp-time relative flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-sm tabular-nums">
          <Clock3 aria-hidden="true" />
          {timer.overdue && "+"}{timerLabel(timer.seconds)}
        </span>}
      </Button>
      {notice && <p role="status" className={`mt-2 text-sm leading-snug ${notice.kind === "confirmed" ? "text-destructive" : "text-warning"}`}>
        {displayText(notice.kind === "confirmed" ? "−{{points}} Priority Points: Start OTP delayed." : "Start your booking within 10 minutes to avoid losing {{points}} priority points.", { points: notice.points })}
      </p>}
    </div>
  );
}
