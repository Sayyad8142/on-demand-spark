import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ActiveWorker = {
  id: string;
  full_name: string | null;
  phone: string | null;
  last_heartbeat_at: string | null;
  last_device_ack_at: string | null;
  app_version: string | null;
  app_platform: string | null;
  last_boot_android_version: string | null;
  device_manufacturer: string | null;
  fcm_token_status: string | null;
  fcm_token_updated_at: string | null;
};

type DispatchRow = {
  id: string;
  booking_id: string;
  worker_id: string;
  status: string;
  push_sent_at: string | null;
  device_received_at: string | null;
  popup_shown_at: string | null;
  worker_seen_at: string | null;
  device_opened_at: string | null;
  responded_at: string | null;
  notified_at: string | null;
  offered_at: string | null;
  device_app_version: string | null;
  worker_name?: string | null;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function diffMs(a: string | null, b: string | null) {
  if (!a || !b) return null;
  return new Date(b).getTime() - new Date(a).getTime();
}

function Delta({ from, to }: { from: string | null; to: string | null }) {
  const d = diffMs(from, to);
  if (d === null) return null;
  const color = d < 2000 ? "text-green-600" : d < 8000 ? "text-amber-600" : "text-red-600";
  return <span className={`text-[10px] ${color}`}>+{(d / 1000).toFixed(2)}s</span>;
}

function ageStr(ts: string | null) {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminDispatchTelemetry() {
  const [workers, setWorkers] = useState<ActiveWorker[]>([]);
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const { data: w } = await supabase
        .from("workers")
        .select(
          "id, full_name, phone, last_heartbeat_at, last_device_ack_at, app_version, app_platform, last_boot_android_version, device_manufacturer, fcm_token_status, fcm_token_updated_at"
        )
        .gte("last_heartbeat_at", since24h)
        .order("last_heartbeat_at", { ascending: false })
        .limit(50);

      const { data: br } = await supabase
        .from("booking_requests")
        .select(
          "id, booking_id, worker_id, status, push_sent_at, device_received_at, popup_shown_at, worker_seen_at, device_opened_at, responded_at, notified_at, offered_at, device_app_version"
        )
        .gte("offered_at", since24h)
        .order("offered_at", { ascending: false })
        .limit(50);

      const workerIds = Array.from(new Set((br ?? []).map((r) => r.worker_id))).filter(Boolean);
      let nameMap: Record<string, string> = {};
      if (workerIds.length) {
        const { data: ws } = await supabase
          .from("workers")
          .select("id, full_name")
          .in("id", workerIds);
        nameMap = Object.fromEntries((ws ?? []).map((x: any) => [x.id, x.full_name]));
      }

      if (cancelled) return;
      setWorkers((w as ActiveWorker[]) ?? []);
      setRows(
        ((br as DispatchRow[]) ?? []).map((r) => ({ ...r, worker_name: nameMap[r.worker_id] ?? r.worker_id.slice(0, 8) }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispatch Telemetry</h1>
          <p className="text-sm text-muted-foreground">Auto-refresh every 5s · Last update {new Date().toLocaleTimeString()}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setTick((x) => x + 1)}>
          Refresh
        </Button>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">
          Active Telemetry Workers <Badge variant="secondary">{workers.length}</Badge>
        </h2>
        <p className="text-xs text-muted-foreground mb-2">Workers who sent a heartbeat in the last 24h (i.e. running the new APK).</p>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-left p-2">Heartbeat</th>
                <th className="text-left p-2">Last Device ACK</th>
                <th className="text-left p-2">App ver</th>
                <th className="text-left p-2">Platform</th>
                <th className="text-left p-2">Android</th>
                <th className="text-left p-2">Mfr</th>
                <th className="text-left p-2">FCM token</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-t">
                  <td className="p-2 font-medium">{w.full_name || "—"}</td>
                  <td className="p-2">{w.phone || "—"}</td>
                  <td className="p-2">{ageStr(w.last_heartbeat_at)}</td>
                  <td className="p-2">{ageStr(w.last_device_ack_at)}</td>
                  <td className="p-2">{w.app_version || "—"}</td>
                  <td className="p-2">{w.app_platform || "—"}</td>
                  <td className="p-2">{w.last_boot_android_version || "—"}</td>
                  <td className="p-2">{w.device_manufacturer || "—"}</td>
                  <td className="p-2">
                    <span className="text-xs">
                      {w.fcm_token_status || "—"} · {ageStr(w.fcm_token_updated_at)}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && workers.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-muted-foreground text-sm">
                    No workers heartbeating in last 24h
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">
          Booking Dispatch (last 24h) <Badge variant="secondary">{rows.length}</Badge>
        </h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">Worker</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">push_sent_at</th>
                <th className="text-left p-2">device_received_at</th>
                <th className="text-left p-2">popup_shown_at</th>
                <th className="text-left p-2">worker_seen_at</th>
                <th className="text-left p-2">device_opened_at</th>
                <th className="text-left p-2">accepted_at</th>
                <th className="text-left p-2">App ver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const accepted = r.status === "accepted" ? r.responded_at : null;
                const pushTs = r.push_sent_at || r.notified_at;
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2">
                      <div className="font-medium">{r.worker_name}</div>
                      <div className="text-[10px] text-muted-foreground">{r.booking_id.slice(0, 8)}</div>
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={
                          r.status === "accepted"
                            ? "default"
                            : r.status === "rejected" || r.status === "timeout"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-2">{fmt(pushTs)}</td>
                    <td className="p-2">
                      {fmt(r.device_received_at)} <Delta from={pushTs} to={r.device_received_at} />
                    </td>
                    <td className="p-2">
                      {fmt(r.popup_shown_at)} <Delta from={r.device_received_at} to={r.popup_shown_at} />
                    </td>
                    <td className="p-2">
                      {fmt(r.worker_seen_at)} <Delta from={r.popup_shown_at} to={r.worker_seen_at} />
                    </td>
                    <td className="p-2">{fmt(r.device_opened_at)}</td>
                    <td className="p-2">
                      {fmt(accepted)} <Delta from={r.worker_seen_at} to={accepted} />
                    </td>
                    <td className="p-2">{r.device_app_version || "—"}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-muted-foreground">
                    No booking_requests in last 24h
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <p className="text-[11px] text-muted-foreground mt-2">
          Green Δ &lt; 2s · Amber 2–8s · Red &gt; 8s. Missing timestamps = old APK or telemetry not delivered.
        </p>
      </section>
    </div>
  );
}
