import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AvailabilityToggleProps {
  isOnline: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}

export default function AvailabilityToggle({ isOnline, onToggle, disabled }: AvailabilityToggleProps) {
  const { t } = useTranslation();
  
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
              {isOnline ? t('home.goOnline') : t('home.goOffline')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {isOnline ? t('home.onlineDesc') : t('home.offlineDesc')}
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