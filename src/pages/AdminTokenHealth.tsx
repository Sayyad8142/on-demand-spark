import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";

interface Row {
  id: string;
  full_name: string | null;
  phone: string | null;
  community: string | null;
  last_heartbeat_at: string | null;
  fcm_token: string | null;
  has_token: boolean;
  fcm_token_status: string | null;
  fcm_token_platform: string | null;
  fcm_token_updated_at: string | null;
  last_fcm_token_refresh_at: string | null;
  last_notification_received_at: string | null;
  fcm_last_send_at: string | null;
  fcm_last_fail_at: string | null;
  fcm_last_fail_reason: string | null;
  notification_health: string | null;
  notification_health_score: number | null;
  notification_permission: string | null;
  notification_repair_failures: number | null;
  app_version: string | null;
  last_app_opened_at: string | null;
}

type FilterKey = "" | "failures3" | "permdenied" | "noheartbeat30";

const fmt = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  let rel = "";
  if (mins < 1) rel = "just now";
  else if (mins < 60) rel = `${mins}m ago`;
  else if (mins < 1440) rel = `${Math.round(mins / 60)}h ago`;
  else rel = `${Math.round(mins / 1440)}d ago`;
  return `${d.toLocaleString()} (${rel})`;
};

const statusVariant = (s: string | null): "default" | "secondary" | "destructive" | "outline" => {
  if (!s) return "outline";
  if (s === "active") return "default";
  if (s === "invalid" || s === "unregistered") return "destructive";
  return "secondary";
};

export default function AdminTokenHealth() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>("");

  const load = useCallback(async (q: string, f: FilterKey) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      if (f) params.set("filter", f);
      const url = `https://paywwbuqycovjopryele.supabase.co/functions/v1/admin-token-health${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      setRows(payload?.workers || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("", "");
  }, [load]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Admin: Worker Token Health</CardTitle>
            <Button size="sm" variant="outline" onClick={() => load(search, filter)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                load(search, filter);
              }}
            >
              <Input
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="submit" disabled={loading}>Search</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {([
                ["", "All"],
                ["failures3", "Failures ≥ 3"],
                ["permdenied", "Permission denied"],
                ["noheartbeat30", "No heartbeat > 30d"],
              ] as [FilterKey, string][]).map(([key, label]) => (
                <Button
                  key={key || "all"}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => { setFilter(key); load(search, key); }}
                  disabled={loading}
                >
                  {label}
                </Button>
              ))}
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="text-xs text-muted-foreground">
              Showing {rows.length} workers (read-only). Tokens shown as prefix only.
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 pt-2">
          <h2 className="text-lg font-semibold">Notification Issues</h2>

          {rows.map((w) => (
            <Card key={w.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <div className="font-semibold">{w.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{w.phone || "—"} · {w.community || "no community"} · {w.id.slice(0, 8)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={statusVariant(w.fcm_token_status)}>
                      {w.fcm_token_status || "no-status"}
                    </Badge>
                    {w.fcm_token_platform && <Badge variant="outline">{w.fcm_token_platform}</Badge>}
                    {!w.has_token && <Badge variant="destructive">no token</Badge>}
                    {w.notification_health && (
                      <Badge variant="secondary">
                        health: {w.notification_health}
                        {w.notification_health_score != null ? ` (${w.notification_health_score})` : ""}
                      </Badge>
                    )}
                    {w.notification_permission && (
                      <Badge variant="outline">perm: {w.notification_permission}</Badge>
                    )}
                    {(w.notification_repair_failures ?? 0) > 0 && (
                      <Badge variant={(w.notification_repair_failures ?? 0) >= 3 ? "destructive" : "secondary"}>
                        repair fails: {w.notification_repair_failures}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Token:</span> {w.fcm_token || "—"}</div>
                  <div><span className="text-muted-foreground">Token updated:</span> {fmt(w.fcm_token_updated_at)}</div>
                  <div><span className="text-muted-foreground">Last token refresh:</span> {fmt(w.last_fcm_token_refresh_at)}</div>
                  <div><span className="text-muted-foreground">Last notification received:</span> {fmt(w.last_notification_received_at)}</div>
                  <div><span className="text-muted-foreground">Last heartbeat:</span> {fmt(w.last_heartbeat_at)}</div>
                  <div><span className="text-muted-foreground">Last app open:</span> {fmt(w.last_app_opened_at)}</div>
                  <div><span className="text-muted-foreground">App version:</span> {w.app_version || "—"}</div>
                  <div><span className="text-muted-foreground">Last FCM send:</span> {fmt(w.fcm_last_send_at)}</div>
                  <div><span className="text-muted-foreground">Last FCM fail:</span> {fmt(w.fcm_last_fail_at)}</div>
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">Invalidation reason:</span>{" "}
                    {w.fcm_last_fail_reason ? (
                      <span className="text-destructive">{w.fcm_last_fail_reason}</span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!loading && rows.length === 0 && !error && (
            <div className="text-center text-sm text-muted-foreground py-8">No workers found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
