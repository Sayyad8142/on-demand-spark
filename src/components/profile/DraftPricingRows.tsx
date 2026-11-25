import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { displayText as d, displayLocale } from '@/i18n/display';
import { readableFlatSize, type PricingCommunity } from '@/lib/servicePricing';
import { draftFlatGroups, pricingExample } from '@/lib/servicePricingDraft';

const money = (n: number) => new Intl.NumberFormat(displayLocale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const taskLabels = { floor_cleaning: 'Floor Cleaning', dish_washing: 'Dishwashing', combined: 'Both Services' } as const;
const sourceLabel = (s: string) => s === 'community' ? d('Community price') : s === 'global' ? d('Standard price') : null;

/** Server rows only; the example uses server parts and the hosted floor-fee rule, for new bookings. */
export default function DraftPricingRows({ community }: { community: PricingCommunity }) {
  const groups = draftFlatGroups(community.draft_maid);
  const [flat, setFlat] = useState(groups[0]?.flat_size ?? '');
  const tasks = groups.find(g => g.flat_size === flat)?.tasks ?? [];
  const [taskKey, setTaskKey] = useState<string>(tasks[0]?.task ?? '');
  const row = tasks.find(t => t.task === taskKey) ?? tasks[0];
  const [intensity, setIntensity] = useState('none');
  const [slot, setSlot] = useState('none');
  const maid = community.services.find(s => s.service_key === 'maid');
  const workloads = maid?.service_key === 'maid' ? maid.dish_workloads : [];
  const slots = community.slots.filter(s => s.service_key === 'maid');
  const hasDish = row?.task === 'dish_washing' || row?.task === 'combined';
  const extra = !hasDish || intensity === 'none' ? 0 : workloads.find(w => w.intensity === intensity)?.extra_inr;
  const adjustment = slot === 'none' ? 0 : slots.find(s => s.slot_time === slot)?.adjustment_inr;
  const example = row && extra !== undefined && adjustment !== undefined ? pricingExample(row.price_inr, extra, adjustment, community.commission.percent) : null;
  return <div className="space-y-6">
    <div className="space-y-3">{groups.map(g => <article key={g.flat_size} className="rounded-lg border border-border p-3">
      <h4 className="text-base font-bold">{readableFlatSize(g.flat_size)}</h4>
      <dl className="mt-2 divide-y divide-border">{g.tasks.map(r => <div key={r.task} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
        <dt className="min-w-0 break-words">{d(taskLabels[r.task])}{sourceLabel(r.source) && <span className="block text-xs text-muted-foreground">{sourceLabel(r.source)}</span>}</dt>
        <dd className="text-right"><span className="block">{money(r.price_inr)}</span><span className="block text-sm font-semibold text-success">{d('Estimated Earnings')}: ~{money(r.worker_estimate_inr)}</span></dd>
      </div>)}</dl>
    </article>)}</div>
    {groups.length > 0 && <section className="space-y-3 rounded-lg bg-muted p-4">
      <h3 className="text-lg font-bold">{d('Price example')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={flat} onValueChange={v => { setFlat(v); setTaskKey(groups.find(g => g.flat_size === v)?.tasks[0]?.task ?? ''); }}><SelectTrigger aria-label={d('Flat Size')} className="bg-background"><SelectValue /></SelectTrigger><SelectContent>{groups.map(g => <SelectItem key={g.flat_size} value={g.flat_size}>{readableFlatSize(g.flat_size)}</SelectItem>)}</SelectContent></Select>
        <Select value={row?.task ?? ''} onValueChange={setTaskKey}><SelectTrigger aria-label={d('Service')} className="bg-background"><SelectValue /></SelectTrigger><SelectContent>{tasks.map(t => <SelectItem key={t.task} value={t.task}>{d(taskLabels[t.task])}</SelectItem>)}</SelectContent></Select>
        {hasDish && workloads.length > 0 && <Select value={intensity} onValueChange={setIntensity}><SelectTrigger aria-label={d('Dish workload')} className="bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{d('Dish workload')}: {d('Base price')}</SelectItem>{workloads.map(w => <SelectItem key={w.intensity} value={w.intensity}>{w.label} · {w.description} (+{money(w.extra_inr)})</SelectItem>)}</SelectContent></Select>}
        {slots.length > 0 && <Select value={slot} onValueChange={setSlot}><SelectTrigger aria-label={d('Time-based adjustments')} className="bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{d('Time-based adjustments')}: {d('Base price')}</SelectItem>{slots.map(s => <SelectItem key={s.slot_time} value={s.slot_time}>{s.slot_time.slice(0, 5)} IST ({s.adjustment_inr > 0 ? '+' : ''}{money(s.adjustment_inr)})</SelectItem>)}</SelectContent></Select>}
      </div>
      {example ? <dl className="grid grid-cols-2 gap-2 text-base"><dt>{d('Customer charge')}</dt><dd className="text-right">{money(example.total)}</dd><dt>{d('Community service fee')} ({community.commission.percent}%)</dt><dd className="text-right">−{money(example.fee)}</dd><dt className="font-bold">{d('Estimated Earnings')}</dt><dd className="text-right text-xl font-bold text-success">~{money(example.estimate)}</dd></dl> : <p>{d('Pricing unavailable')}</p>}
      <p className="text-sm text-muted-foreground">{d('Customer-specific charges are excluded from these estimates.')}</p>
      <p className="text-sm text-muted-foreground">{d('Estimate for new bookings. Your actual amount appears in earnings history.')}</p>
    </section>}
  </div>;
}
