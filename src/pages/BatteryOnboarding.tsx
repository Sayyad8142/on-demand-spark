import { BatteryWarning, X, Check, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatteryOnboardingProps {
  onFixNow: () => void;
  onSkip: () => void;
}

export default function BatteryOnboarding({ onFixNow, onSkip }: BatteryOnboardingProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top decorative arc */}
      <div
        className="absolute top-0 left-0 right-0 h-[45vh] rounded-b-[3rem]"
        style={{ background: "linear-gradient(180deg, #ffe6f2 0%, #fff0f7 60%, #ffffff 100%)" }}
      />

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
        {/* Large battery warning icon */}
        <div className="mb-8">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#ffe6f2" }}
          >
            <BatteryWarning className="w-14 h-14" style={{ color: "#ff007a" }} />
          </div>
        </div>

        {/* Headline */}
        <h1
          className="text-center font-extrabold leading-tight tracking-tight"
          style={{ fontSize: "2rem", color: "#1a1a1a" }}
        >
          Don&apos;t Miss
          <br />
          Booking Alerts
        </h1>

        {/* Visual chain */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#ffebee" }}
            >
              <X className="w-5 h-5" style={{ color: "#e53935" }} />
            </div>
            <span className="font-semibold text-base" style={{ color: "#1a1a1a" }}>
              Battery Saver ON
            </span>
          </div>

          <ArrowDown className="w-5 h-5" style={{ color: "#ff007a" }} />

          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#e8f5e9" }}
            >
              <Check className="w-5 h-5" style={{ color: "#43a047" }} />
            </div>
            <span className="font-semibold text-base" style={{ color: "#1a1a1a" }}>
              Booking alerts stop
            </span>
          </div>
        </div>
      </div>

      {/* Bottom action area */}
      <div className="relative px-6 pb-10 pt-4 space-y-3">
        <Button
          size="lg"
          className="w-full h-14 text-base font-bold rounded-2xl"
          style={{
            backgroundColor: "#ff007a",
            color: "#ffffff",
          }}
          onClick={onFixNow}
        >
          Fix Now
        </Button>
        <button
          onClick={onSkip}
          className="w-full h-10 text-sm font-medium rounded-xl transition-colors hover:bg-gray-50"
          style={{ color: "#6b7280" }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
