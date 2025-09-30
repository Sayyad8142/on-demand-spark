import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Wifi, WifiOff } from "lucide-react";

interface AvailabilityToggleProps {
  isOnline: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}

export default function AvailabilityToggle({ isOnline, onToggle, disabled }: AvailabilityToggleProps) {
  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            isOnline ? 'bg-primary/10' : 'bg-muted'
          }`}>
            {isOnline ? (
              <Wifi className="w-6 h-6 text-primary" />
            ) : (
              <WifiOff className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <Label htmlFor="availability" className="text-base font-semibold">
              {isOnline ? "You're Online" : "You're Offline"}
            </Label>
            <p className="text-sm text-muted-foreground">
              {isOnline ? "Ready to accept bookings" : "Not accepting bookings"}
            </p>
          </div>
        </div>
        <Switch
          id="availability"
          checked={isOnline}
          onCheckedChange={onToggle}
          disabled={disabled}
          className="data-[state=checked]:bg-primary"
        />
      </div>
    </Card>
  );
}