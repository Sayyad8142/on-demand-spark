import "@/i18n/priorityScoreV2Messages";
import { displayText, displayLocale, useWorkerLanguage } from "@/i18n/display";
import { RefreshCw, ShieldCheck, Eye } from "lucide-react";
import { activePenalties, componentValue, type PriorityScoreV2, type V2ComponentKey } from "@/lib/priorityScoreV2";

const LABEL: Record<V2ComponentKey, string> = {
  completed_bookings: "Completed bookings",
  customer_ratings: "Customer ratings",
  booking_acceptance: "Booking acceptance",
  start_otp_on_time: "On-time Start OTP",
};

function day(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(displayLocale(), { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Read-only V2 breakdown. Every number shown is copied from Admin's response. */
export default function PriorityScoreV2Breakdown({ data, preview, onRefresh, refreshing }: {
  data: PriorityScoreV2; preview: boolean; onRefresh: () => void; refreshing: boolean;
}) {
  useWorkerLanguage();
  const penalties = activePenalties(data);
  const protection = data.new_worker_protection;
  return (
    <section className="space-y-3" aria-label={displayText("Score breakdown")}>
      {preview && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" />{displayText("Preview — not your official score")}</span>
          {data.v2_score !== null && <span className="text-xs text-muted-foreground">{displayText("Preview score")}: <b>{data.v2_score}</b>/{data.max_score}</span>}
        </div>
      )}

      <ul className="space-y-2.5">
        {data.components.map(c => {
          const v = componentValue(c);
          const pct = v.kind === "points" && c.max_points > 0 ? Math.max(0, Math.min(100, ((v.points ?? 0) / c.max_points) * 100)) : 0;
          return (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{displayText(LABEL[c.key])}</span>
                {v.kind === "points" ? (
                  <span className="font-bold tabular-nums">{v.points}<span className="font-normal text-muted-foreground">/{v.max}</span></span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {displayText(v.kind === "new_worker" ? "New Worker" : "Not measured yet")}
                  </span>
                )}
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              {(c.period_days || c.detail) && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.period_days ? displayText("Last {{days}} days", { days: c.period_days }) : null}
                  {c.period_days && c.detail ? " · " : null}{c.detail}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <p className="mb-1.5 text-xs font-semibold">{displayText("Active penalties")}</p>
        {penalties.length === 0 ? (
          <p className="text-xs text-muted-foreground">{displayText("No active penalties")}</p>
        ) : (
          <ul className="space-y-1.5">
            {penalties.map(p => (
              <li key={p.id} className="rounded-lg bg-destructive/10 px-3 py-2">
                <div className="flex justify-between gap-2 text-sm">
                  <span>{p.reason}</span><span className="font-bold text-destructive tabular-nums">−{p.points}</span>
                </div>
                {(p.expires_at || p.recovery) && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {p.expires_at ? displayText("Ends {{date}}", { date: day(p.expires_at) ?? "" }) : null}
                    {p.expires_at && p.recovery ? " · " : null}{p.recovery}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {protection?.active && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <b>{protection.ends_at ? displayText("New-worker protection until {{date}}", { date: day(protection.ends_at) ?? "" }) : displayText("New-worker protection is on")}</b>
            {protection.detail && <span className="block text-muted-foreground">{protection.detail}</span>}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        {data.updated_at ? <span className="text-[11px] text-muted-foreground">{displayText("Updated {{date}}", { date: new Date(data.updated_at).toLocaleString(displayLocale(), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) })}</span> : <span />}
        <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{displayText("Refresh")}
        </button>
      </div>
    </section>
  );
}
