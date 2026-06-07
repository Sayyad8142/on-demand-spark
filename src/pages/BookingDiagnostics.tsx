import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Check, X, AlertTriangle, Copy } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { checkOverlayPermission } from "@/native/overlay";

type Row = { label: string; value: string; status?: "ok" | "warn" | "bad" | "info"; hint?: string };

function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BookingDiagnostics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawWorker, setRawWorker] = useState<any>(null);

  const run = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const out: Row[] = [];

    // Worker row
    const { data: worker } = await supabase
      .from("workers")
      .select("*")
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();
    setRawWorker(worker);

    if (!worker) {
      out.push({ label: "Worker Profile", value: "NOT FOUND", status: "bad", hint: "No row in workers table for this user" });
      setRows(out);
      setLoading(false);
      return;
    }

    out.push({ label: "Worker ID", value: worker.id, status: "info" });
    out.push({ label: "Full Name", value: worker.full_name || "—", status: "info" });
    out.push({ label: "Phone", value: worker.phone || "—", status: "info" });
    out.push({ label: "Community", value: worker.community || "—", status: worker.community ? "ok" : "bad" });
    out.push({
      label: "Services Offered",
      value: (worker.service_types || []).join(", ") || "—",
      status: (worker.service_types?.length ?? 0) > 0 ? "ok" : "bad",
    });
    out.push({
      label: "Available (toggle ON)",
      value: worker.is_available ? "YES" : "NO",
      status: worker.is_available ? "ok" : "bad",
      hint: worker.is_available ? "Eligible for dispatch" : "Turn Online on Home tab",
    });
    out.push({ label: "Is Active", value: worker.is_active ? "YES" : "NO", status: worker.is_active ? "ok" : "bad" });
    out.push({
      label: "Is Blocked",
      value: worker.is_blocked ? `YES (${worker.blocked_reason || "no reason"})` : "no",
      status: worker.is_blocked ? "bad" : "ok",
    });
    out.push({
      label: "Currently Busy (active booking)",
      value: worker.is_busy ? "YES — will NOT receive new offers" : "no",
      status: worker.is_busy ? "warn" : "ok",
    });

    // FCM
    out.push({
      label: "FCM Token",
      value: worker.fcm_token ? `${worker.fcm_token.slice(0, 18)}… (${worker.fcm_token.length} chars)` : "MISSING",
      status: worker.fcm_token ? (worker.fcm_token_status === "invalid" ? "bad" : "ok") : "bad",
      hint: worker.fcm_token_status === "invalid" ? "Token marked invalid — reopen app to refresh" : undefined,
    });
    out.push({
      label: "FCM Token Status",
      value: worker.fcm_token_status || "unknown",
      status: worker.fcm_token_status === "active" ? "ok" : worker.fcm_token_status === "invalid" ? "bad" : "warn",
    });
    out.push({ label: "FCM Token Updated", value: timeAgo(worker.fcm_token_updated_at), status: "info" });
    out.push({
      label: "Last FCM Send (server → device)",
      value: timeAgo(worker.fcm_last_send_at),
      status: "info",
    });
    out.push({
      label: "Last FCM Fail Reason",
      value: worker.fcm_last_fail_reason
        ? `${worker.fcm_last_fail_reason} (${timeAgo(worker.fcm_last_fail_at)})`
        : "none",
      status: worker.fcm_last_fail_reason ? "bad" : "ok",
    });
    out.push({
      label: "Consecutive Delivery Failures",
      value: String(worker.consecutive_delivery_failures ?? 0),
      status: (worker.consecutive_delivery_failures ?? 0) > 3 ? "bad" : "ok",
    });

    // Push health
    out.push({
      label: "Push Health",
      value: worker.push_health_status || worker.notification_health || "unknown",
      status:
        (worker.push_health_status || worker.notification_health) === "good"
          ? "ok"
          : (worker.push_health_status || worker.notification_health) === "blocked"
            ? "bad"
            : "warn",
    });
    if (worker.push_block_reason) {
      out.push({ label: "Push Block Reason", value: worker.push_block_reason, status: "bad" });
    }

    // Heartbeat / activity
    out.push({
      label: "Last Heartbeat",
      value: timeAgo(worker.last_heartbeat_at),
      status: worker.last_heartbeat_at && Date.now() - new Date(worker.last_heartbeat_at).getTime() < 10 * 60 * 1000 ? "ok" : "warn",
      hint: "Should be < 2 minutes if app is open",
    });
    out.push({ label: "Last Seen", value: timeAgo(worker.last_seen_at), status: "info" });
    out.push({ label: "Last Active", value: timeAgo(worker.last_active_at), status: "info" });
    out.push({ label: "Last App Opened", value: timeAgo(worker.last_app_opened_at), status: "info" });
    out.push({
      label: "Stale Device",
      value: worker.stale_device ? "YES (excluded from dispatch)" : "no",
      status: worker.stale_device ? "bad" : "ok",
    });
    out.push({
      label: "No-ACK Count",
      value: String(worker.no_ack_count ?? 0),
      status: (worker.no_ack_count ?? 0) > 2 ? "warn" : "ok",
    });

    // Booking signals
    out.push({
      label: "Last Booking Offered",
      value: timeAgo(worker.last_offer_at),
      status: "info",
    });
    out.push({
      label: "Last Notification Received (device)",
      value: timeAgo(worker.last_notification_received_at),
      status: "info",
    });
    out.push({
      label: "Last Booking Acknowledged",
      value: timeAgo(worker.last_acknowledged_booking_at),
      status: "info",
    });
    out.push({
      label: "Last Booking Completed",
      value: timeAgo(worker.last_booking_completed_at),
      status: "info",
    });

    // App / device meta
    out.push({ label: "App Version", value: worker.app_version || "—", status: "info" });
    out.push({ label: "Build #", value: worker.build_number || "—", status: "info" });
    out.push({ label: "Platform", value: worker.app_platform || Capacitor.getPlatform(), status: "info" });
    out.push({ label: "Device", value: worker.device_manufacturer || "—", status: "info" });

    // Live permission checks
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await PushNotifications.checkPermissions();
        out.push({
          label: "Notification Permission (live)",
          value: perm.receive,
          status: perm.receive === "granted" ? "ok" : "bad",
        });
      } catch {
        out.push({ label: "Notification Permission (live)", value: "unknown", status: "warn" });
      }

      try {
        const overlay = await checkOverlayPermission();
        out.push({
          label: "Overlay Permission (live)",
          value: overlay ? "granted" : "denied",
          status: overlay ? "ok" : "bad",
          hint: overlay ? undefined : "Required for booking pop-up over other apps",
        });
      } catch {
        out.push({ label: "Overlay Permission (live)", value: "unknown", status: "warn" });
      }

      out.push({
        label: "Battery Optimization Disabled",
        value: worker.battery_optimization_disabled ? "YES" : "NO",
        status: worker.battery_optimization_disabled ? "ok" : "warn",
        hint: "Disable battery optimization for reliable background delivery",
      });

      try {
        const state = await CapApp.getState();
        out.push({ label: "App State (live)", value: state.isActive ? "foreground" : "background", status: "info" });
      } catch {
        /* ignore */
      }
    } else {
      out.push({
        label: "Platform",
        value: "Web (no native overlay / battery info)",
        status: "info",
      });
    }

    // Session
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      out.push({
        label: "Auth Session",
        value: session ? "valid" : "missing",
        status: session ? "ok" : "bad",
      });
    } catch {
      out.push({ label: "Auth Session", value: "error", status: "bad" });
    }

    // Internet
    out.push({
      label: "Internet",
      value: navigator.onLine ? "online" : "offline",
      status: navigator.onLine ? "ok" : "bad",
    });

    setRows(out);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    run();
  }, [run]);

  const copyReport = async () => {
    const text = rows.map((r) => `${r.label}: ${r.value}${r.hint ? ` — ${r.hint}` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Diagnostics copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const icon = (s?: Row["status"]) => {
    if (s === "ok") return <Check className="w-4 h-4 text-green-600" />;
    if (s === "bad") return <X className="w-4 h-4 text-red-600" />;
    if (s === "warn") return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return <span className="w-4 h-4 inline-block rounded-full bg-muted-foreground/30" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Booking Diagnostics</h1>
            <p className="text-xs text-muted-foreground">Why am I not getting bookings?</p>
          </div>
          <Button variant="outline" size="icon" onClick={copyReport} title="Copy">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={run} disabled={loading} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-2">
        {rawWorker && (
          <Card className="p-3 flex flex-wrap gap-2">
            <Badge variant={rawWorker.is_available ? "default" : "destructive"}>
              {rawWorker.is_available ? "Online" : "Offline"}
            </Badge>
            <Badge variant={rawWorker.fcm_token ? "default" : "destructive"}>
              FCM {rawWorker.fcm_token ? "OK" : "MISSING"}
            </Badge>
            <Badge variant={rawWorker.stale_device ? "destructive" : "default"}>
              {rawWorker.stale_device ? "Stale Device" : "Fresh"}
            </Badge>
            <Badge variant={rawWorker.is_busy ? "secondary" : "default"}>
              {rawWorker.is_busy ? "Busy" : "Free"}
            </Badge>
          </Card>
        )}

        {rows.map((r, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{icon(r.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{r.label}</span>
                </div>
                <div className="text-sm font-medium break-all">{r.value}</div>
                {r.hint && <div className="text-xs text-muted-foreground mt-0.5">{r.hint}</div>}
              </div>
            </div>
          </Card>
        ))}

        {!loading && rows.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No data</p>
        )}
      </main>
    </div>
  );
}
