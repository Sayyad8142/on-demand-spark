import { BatteryFull } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatteryOnboardingProps {
  onFixNow: () => void;
  onSkip?: () => void;
}

export default function BatteryOnboarding({ onFixNow }: BatteryOnboardingProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-10">
      {/* Battery icon — fully charged, green */}
      <div
        className="flex items-center justify-center mb-10"
        style={{
          width: 150,
          height: 150,
          borderRadius: 40,
          backgroundColor: "#e8f9ee",
        }}
      >
        <BatteryFull
          style={{ width: 96, height: 96, color: "#16a34a" }}
          strokeWidth={2}
          fill="#16a34a"
        />
      </div>

      {/* Trilingual titles */}
      <h1
        className="text-center font-bold tracking-tight"
        style={{ fontSize: "1.875rem", color: "#0f172a", lineHeight: 1.2 }}
      >
        Give Battery Permission
      </h1>
      <h2
        className="mt-3 text-center font-semibold"
        style={{ fontSize: "1.375rem", color: "#0f172a", lineHeight: 1.25 }}
      >
        बैटरी अनुमति दें
      </h2>
      <h2
        className="mt-2 text-center font-semibold"
        style={{ fontSize: "1.375rem", color: "#0f172a", lineHeight: 1.25 }}
      >
        బ్యాటరీ అనుమతి ఇవ్వండి
      </h2>

      {/* Button in the middle — right under the titles, always reachable */}
      <div className="w-full max-w-sm mt-10">
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
