import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, CheckCircle2, Circle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  workerId?: string | null;
}

const HOURS = Array.from({ length: 13 }, (_, i) => 7 + i); // 7..19

const hourLabel = (h: number) => {
  const period = h >= 12 ? "p" : "a";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}${period}`;
};

const hourLong = (h: number) => {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:00 ${period}`;
};

export default function HourlyBookingsChart({ workerId }: Props) {
  const [bookingsByHour, setBookingsByHour] = useState<Record<number, number>>({});
  const [availableHours, setAvailableHours] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Fetch booking volume for last 90 days, grouped by scheduled_time hour
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("bookings")
        .select("scheduled_time")
        .gte("created_at", since)
        .not("scheduled_time", "is", null)
        .limit(5000);

      if (cancelled) return;
      const counts: Record<number, number> = {};
      if (!error && data) {
        for (const row of data as any[]) {
          const t: string | null = row.scheduled_time;
          if (!t) continue;
          const h = parseInt(t.split(":")[0], 10);
          if (!Number.isFinite(h)) continue;
          counts[h] = (counts[h] || 0) + 1;
        }
      }
      setBookingsByHour(counts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch worker availability for today
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    (async () => {
      // worker_availability stores day_of_week with Mon=0..Sun=6 (based on Availability.tsx)
      const jsDow = new Date().getDay(); // Sun=0..Sat=6
      const dow = jsDow === 0 ? 6 : jsDow - 1;
      const { data } = await supabase
        .from("worker_availability")
        .select("slots")
        .eq("worker_id", workerId)
        .eq("day_of_week", dow)
        .maybeSingle();
      if (cancelled) return;
      const set = new Set<number>();
      const slots = (data?.slots as unknown as boolean[] | null) || null;
      if (slots) {
        // Slots are 30-min from 7:00 onward. Hour h => indices (h-7)*2 and (h-7)*2+1
        for (const h of HOURS) {
          const i1 = (h - 7) * 2;
          const i2 = i1 + 1;
          if (slots[i1] || slots[i2]) set.add(h);
        }
      }
      setAvailableHours(set);
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const data = useMemo(
    () =>
      HOURS.map((h) => ({
        hour: h,
        label: hourLabel(h),
        bookings: bookingsByHour[h] || 0,
        available: availableHours.has(h),
      })),
    [bookingsByHour, availableHours]
  );

  const peakHour = useMemo(() => {
    let best = HOURS[0];
    let max = -1;
    for (const d of data) {
      if (d.bookings > max) {
        max = d.bookings;
        best = d.hour;
      }
    }
    return max > 0 ? best : null;
  }, [data]);

  const availableCount = availableHours.size;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="w-5 h-5" />
          Hourly Booking Demand
        </CardTitle>
        <CardDescription className="text-xs">
          {peakHour !== null ? (
            <>Peak demand at <span className="font-semibold text-foreground">{hourLong(peakHour)}</span> · Last 90 days</>
          ) : (
            <>Bookings by hour · Last 90 days</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: any, _name, props: any) => [
                  `${value} bookings`,
                  props?.payload?.available ? "✓ You are available" : "Not available",
                ]}
                labelFormatter={(label, payload) => {
                  const h = payload?.[0]?.payload?.hour;
                  return typeof h === "number" ? hourLong(h) : String(label);
                }}
              />
              <Bar dataKey="bookings" radius={[6, 6, 0, 0]}>
                {data.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={entry.available ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.35)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Availability strip */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Your availability today</span>
            <span className="font-medium text-foreground">{availableCount}/{HOURS.length} hrs</span>
          </div>
          <div className="grid grid-cols-13 gap-1" style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}>
            {data.map((d) => (
              <div
                key={d.hour}
                className={`h-2 rounded-full ${d.available ? "bg-primary" : "bg-muted"}`}
                title={`${hourLong(d.hour)} — ${d.available ? "Available" : "Off"}`}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>Available hour</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Circle className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span>Off hour</span>
          </div>
        </div>

        {loading && (
          <p className="mt-2 text-xs text-muted-foreground">Loading demand data…</p>
        )}
      </CardContent>
    </Card>
  );
}
