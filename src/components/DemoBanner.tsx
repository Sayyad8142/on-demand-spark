import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('demo_banner_dismissed') === 'true';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('demo_banner_dismissed', 'true');
  };

  // Only show if in demo mode and not dismissed
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';
  
  if (!isDemoMode || dismissed) {
    return null;
  }

  return (
    <div className="bg-amber-500/90 text-white px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2">
        <span className="font-semibold">🎭 Demo Mode</span>
        <span className="text-sm">For Play Store review</span>
      </div>
      <Button
        onClick={handleDismiss}
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-amber-600/50"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
