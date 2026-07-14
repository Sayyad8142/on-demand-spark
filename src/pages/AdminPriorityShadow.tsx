import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";

interface Row {
  worker_id: string;
  full_name: string | null;
  community: string | null;
  is_active: boolean | null;
  completed_bookings: number;
  score_v2: number | null;
  score_v3: number | null;
  diff: number | null;
  rank_v2: number;
  rank_v3: number;
  rank_change: number;
  v3_updated_at: string | null;
}

const BANDS: Array<[string, (n: number) => boolean]> = [
  ["0–20",  (n) => n >= 0  && n <= 20],
  ["21–40", (n) => n > 20  && n <= 40],
  ["41–60", (n) => n > 40  && n <= 60],
  ["61–80", (n) => n > 60  && n <= 80],
  ["81–99", (n) => n > 80  && n <= 99],
  ["100",   (n) => n >= 100],
];

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const fmtScore = (n: number | null) => (n == null ? "—" : Number(n).toFixed(2));

export default function AdminPriorityShadow() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc("get_priority_shadow_comparison");
      if (e) throw e;
      setRows((data ?? []) as Row[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const { error: e } = await (supabase.rpc as any)("recompute_all_priority_scores_v3");
      if (e) throw e;
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const v2 = rows.map((r) => r.score_v2).filter((n): n is number => n != null);
    const v3 = rows.map((r) => r.score_v3).filter((n): n is number => n != null);
    const dist = (arr: number[]) =>
      BANDS.map(([label, fn]) => ({ label, count: arr.filter(fn).length, pct: arr.length ? (arr.filter(fn).length / arr.length) * 100 : 0 }));
    return {
      total: rows.length,
      distV2: dist(v2),
      distV3: dist(v3),
      perfectV2: v2.filter((n) => n >= 100).length,
      perfectV3: v3.filter((n) => n >= 100).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.full_name ?? "").toLowerCase().includes(q) ||
      (r.community ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Priority Score — Shadow (v3)</h1>
          <p className="text-sm text-muted-foreground">
            v2 still drives live dispatch. v3 runs daily in shadow mode for evaluation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">Reload</span>
          </Button>
          <Button size="sm" onClick={recompute} disabled={recomputing}>
            {recomputing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Recompute v3 now
          </Button>
        </div>
      </header>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">v2 distribution (live)</CardTitle></CardHeader>
          <CardContent>
            <BandTable rows={stats.distV2} />
            <p className="text-xs text-muted-foreground mt-2">
              At 100: {stats.perfectV2} / {stats.total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">v3 distribution (shadow)</CardTitle></CardHeader>
          <CardContent>
            <BandTable rows={stats.distV3} />
            <p className="text-xs text-muted-foreground mt-2">
              At 100: {stats.perfectV3} / {stats.total}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Worker comparison</CardTitle>
          <Input
            placeholder="Search name or community"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">Worker</th>
                <th className="py-2 pr-2">Community</th>
                <th className="py-2 pr-2 text-right">Done</th>
                <th className="py-2 pr-2 text-right">v2</th>
                <th className="py-2 pr-2 text-right">v3</th>
                <th className="py-2 pr-2 text-right">Δ</th>
                <th className="py-2 pr-2 text-right">Rank v2</th>
                <th className="py-2 pr-2 text-right">Rank v3</th>
                <th className="py-2 pr-2 text-right">Rank Δ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rankChange = Number(r.rank_change ?? 0);
                const diff = Number(r.diff ?? 0);
                return (
                  <tr key={r.worker_id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      {!r.is_active && <Badge variant="outline" className="mt-1 text-xs">inactive</Badge>}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">{r.community ?? "—"}</td>
                    <td className="py-2 pr-2 text-right">{r.completed_bookings}</td>
                    <td className="py-2 pr-2 text-right">{fmtScore(r.score_v2)}</td>
                    <td className="py-2 pr-2 text-right">{fmtScore(r.score_v3)}</td>
                    <td className={`py-2 pr-2 text-right ${diff > 0 ? "text-green-600" : diff < 0 ? "text-destructive" : ""}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                    </td>
                    <td className="py-2 pr-2 text-right">{r.rank_v2}</td>
                    <td className="py-2 pr-2 text-right">{r.rank_v3}</td>
                    <td className={`py-2 pr-2 text-right ${rankChange > 0 ? "text-green-600" : rankChange < 0 ? "text-destructive" : ""}`}>
                      {rankChange > 0 ? "+" : ""}{rankChange}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">No workers</div>
          )}
          {rows[0]?.v3_updated_at && (
            <p className="text-xs text-muted-foreground mt-3">
              v3 last computed: {fmtDate(rows[0].v3_updated_at)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BandTable({ rows }: { rows: Array<{ label: string; count: number; pct: number }> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b last:border-0">
            <td className="py-1 pr-2 w-16 text-muted-foreground">{r.label}</td>
            <td className="py-1 pr-2 text-right w-12">{r.count}</td>
            <td className="py-1 pr-2 text-right w-16 text-muted-foreground">{r.pct.toFixed(1)}%</td>
            <td className="py-1">
              <div className="h-2 bg-muted rounded">
                <div
                  className="h-2 bg-primary rounded"
                  style={{ width: `${Math.min(100, r.pct)}%` }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
