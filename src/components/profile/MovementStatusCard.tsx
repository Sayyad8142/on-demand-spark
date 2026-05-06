import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { subscribeMovementStatus, type MovementDebugStatus } from "@/lib/stepMonitoring";

const formatLastUpdated = (iso: string | null) => {
  if (!iso) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} sec ago`;
  return `${Math.floor(seconds / 60)} min ago`;
};

export default function MovementStatusCard() {
  const [movementStatus, setMovementStatus] = useState<MovementDebugStatus | null>(null);

  useEffect(() => {
    return subscribeMovementStatus((status) => {
      setMovementStatus(status ?? null);
    });
  }, []);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">📊 Movement Status</p>
          <Badge variant={movementStatus?.status === "Moving" ? "default" : "secondary"}>
            {movementStatus?.status ?? "Not Tracking"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Steps: <span className="font-semibold text-foreground">{movementStatus?.steps ?? 0}</span></div>
          <div>Last Updated: <span className="font-semibold text-foreground">{formatLastUpdated(movementStatus?.lastUpdatedAt ?? null)}</span></div>
          <div>Permission: <span className="font-semibold text-foreground">{movementStatus?.permissionGranted ? "Granted" : "Check pending"}</span></div>
          <div>API: <span className="font-semibold text-foreground">{movementStatus?.lastSendOk === true ? "Success" : movementStatus?.lastSendOk === false ? "Failed" : "Check pending"}</span></div>
        </div>
        {movementStatus?.warning && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{movementStatus.warning}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
