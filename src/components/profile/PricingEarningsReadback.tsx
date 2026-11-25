import { Button } from '@/components/ui/button';
import { displayText as d, displayLocale } from '@/i18n/display';
import type { usePricingEarnings } from '@/hooks/usePricingEarnings';

export default function PricingEarningsReadback({ result }: { result: ReturnType<typeof usePricingEarnings> }) {
  const money = (n: number) => new Intl.NumberFormat(displayLocale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  if (!result.summary) return result.error ? <p className="mt-3 text-sm text-muted-foreground">{d('Earnings unavailable')}</p> : null;
  return <div className="mt-4 space-y-3">
    <dl className="grid grid-cols-2 gap-3"><dt>{d('Today')}</dt><dd className="font-bold text-success">{money(result.summary.today.earnedInr)}</dd><dt>{d('Paid')}</dt><dd>{money(result.summary.totalsInr.paid)}</dd></dl>
    {result.items.map(item => <div key={item.earningId} className="flex items-start justify-between gap-3 border-b border-border py-3"><div className="min-w-0"><p>{new Intl.DateTimeFormat(displayLocale(), { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(item.completedAt))}</p><p className="break-words text-sm text-muted-foreground">{item.statusLabel}</p></div><strong className="shrink-0">{money(item.earningInr)}</strong></div>)}
    {result.cursor && <Button variant="outline" disabled={result.loading} onClick={() => { void result.loadMore(); }}>{d('Show more')}</Button>}
  </div>;
}