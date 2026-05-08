import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  subscribePassiveMovementStatus,
  type PassiveMovementStatus,
} from "@/lib/stepMonitoring";

const formatLastUpdated = (iso: string | null) => {
  if (!iso) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} sec ago`;
  return `${Math.floor(seconds / 60)} min ago`;
};

export default function MovementStatusCard() {
  const [status, setStatus] = useState<PassiveMovementStatus | null>(null);

  useEffect(() => {
    return subscribePassiveMovementStatus((s) => setStatus(s ?? null));
  }, []);

  const trackingLabel = status?.status ?? "Not Tracking";
  const isTracking = status?.status === "Tracking";

  const permissionLabel =
    status?.permissionGranted === true
      ? "Granted"
      : status?.permissionGranted === false
      ? "Denied"
      : "—";

  const apiLabel =
    status?.lastSendOk === true
      ? "Success"
      : status?.lastSendOk === false
      ? "Failed"
      : "—";

  return (
    <Card className="shadow-sm">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">📊 Movement Status</p>
          <Badge variant={isTracking ? "default" : "secondary"}>{trackingLabel}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            Steps:{" "}
            <span className="font-semibold text-foreground">{status?.steps ?? 0}</span>
          </div>
          <div>
            Last Updated:{" "}
            <span className="font-semibold text-foreground">
              {formatLastUpdated(status?.lastUpdatedAt ?? null)}
            </span>
          </div>
          <div>
            Permission:{" "}
            <span className="font-semibold text-foreground">{permissionLabel}</span>
          </div>
          <div>
            API: <span className="font-semibold text-foreground">{apiLabel}</span>
          </div>
        </div>
        {status?.warning && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{status.warning}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
