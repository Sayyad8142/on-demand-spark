import { BatteryCharging } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatteryOnboardingProps {
  onFixNow: () => void;
  onSkip?: () => void;
}

export default function BatteryOnboarding({ onFixNow }: BatteryOnboardingProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div
          className="flex items-center justify-center mb-12"
          style={{
            width: 140,
            height: 140,
            borderRadius: 36,
            backgroundColor: "#fff0f6",
          }}
        >
          <BatteryCharging
            style={{ width: 88, height: 88, color: "#ff007a" }}
            strokeWidth={1.75}
          />
        </div>

        <h1
          className="text-center font-bold tracking-tight"
          style={{ fontSize: "1.875rem", color: "#0f172a", lineHeight: 1.15 }}
        >
          Give Battery Permission
        </h1>

        <p
          className="mt-5 text-center leading-relaxed max-w-[320px]"
          style={{ fontSize: "0.975rem", color: "#475569" }}
        >
          Battery Saver can stop booking alerts when the app is running in the
          background. Allow battery permission to receive every booking instantly.
        </p>
      </div>

      <div className="px-6 pb-8 pt-4">
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-xl shadow-none hover:opacity-90"
          style={{ backgroundColor: "#ff007a", color: "#ffffff" }}
          onClick={onFixNow}
        >
          Give Permission
        </Button>
      </div>
    </div>
  );
}
