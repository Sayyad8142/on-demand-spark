import { BatteryLow, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatteryOnboardingProps {
  onFixNow: () => void;
  onSkip: () => void;
}

export default function BatteryOnboarding({ onFixNow, onSkip }: BatteryOnboardingProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">
        {/* Battery icon */}
        <div className="relative mb-12">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{ backgroundColor: "#fff0f6" }}
          >
            <BatteryLow
              className="w-12 h-12"
              strokeWidth={1.75}
              style={{ color: "#ff007a" }}
            />
          </div>
        </div>

        {/* Headline */}
        <h1
          className="text-center font-bold leading-[1.15] tracking-tight"
          style={{ fontSize: "1.75rem", color: "#0f172a" }}
        >
          Don&apos;t miss
          <br />
          booking alerts
        </h1>

        <p
          className="mt-3 text-center text-sm leading-relaxed max-w-[280px]"
          style={{ color: "#64748b" }}
        >
          Battery Saver stops notifications from reaching you in the background.
        </p>

        {/* Before / After row */}
        <div className="mt-10 w-full max-w-[320px] grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-4 flex flex-col items-start gap-2"
            style={{ backgroundColor: "#fafafa" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#fee2e2" }}
            >
              <BellOff className="w-4 h-4" style={{ color: "#dc2626" }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "#64748b" }}>
                Now
              </p>
              <p className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                Alerts off
              </p>
            </div>
          </div>

          <div
            className="rounded-2xl p-4 flex flex-col items-start gap-2"
            style={{ backgroundColor: "#f0fdf4" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#dcfce7" }}
            >
              <Bell className="w-4 h-4" style={{ color: "#16a34a" }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "#16a34a" }}>
                After fix
              </p>
              <p className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                Alerts on
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action area */}
      <div className="px-6 pb-8 pt-4 space-y-2">
        <Button
          size="lg"
          className="w-full h-12 text-[15px] font-semibold rounded-xl shadow-none"
          style={{
            backgroundColor: "#ff007a",
            color: "#ffffff",
          }}
          onClick={onFixNow}
        >
          Fix now
        </Button>
        <button
          onClick={onSkip}
          className="w-full h-11 text-sm font-medium rounded-xl transition-colors hover:bg-slate-50"
          style={{ color: "#94a3b8" }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
