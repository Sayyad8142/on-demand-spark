import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { displayText as d, displayLocale } from '@/i18n/display';
import type { PricingCommunity } from '@/lib/servicePricing';
import { pricingExample } from '@/lib/servicePricingDraft';

const money = (n: number) => new Intl.NumberFormat(displayLocale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const taskLabels = { floor_cleaning: 'Floor Cleaning', dish_washing: 'Dishwashing', combined: 'Both Services' };
export default function DraftPricingRows({ community }: { community: PricingCommunity }) {
  const [intensity, setIntensity] = useState('base');
  const [slot, setSlot] = useState('base');
  const maid = community.services.find(s => s.service_key === 'maid');
  const workloads = maid?.service_key === 'maid' ? maid.dish_workloads : [];
  const slots = community.slots.filter(s => s.service_key === 'maid');
  const extra = intensity === 'base' ? 0 : workloads.find(w => w.intensity === intensity)?.extra_inr;
  const adjustment = slot === 'base' ? 0 : slots.find(s => s.slot_time === slot)?.adjustment_inr;
  return <div className="space-y-5">
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Flat Size', 'Service', 'Customer charge', 'Estimated Earnings'].map(t => <th key={t} className="p-2 text-left align-bottom break-words">{d(t)}</th>)}</tr></thead><tbody>
      {community.draft_maid?.map(r => <tr key={`${r.flat_size}:${r.task}`} className="border-b border-border"><th className="p-2 text-left font-medium break-words">{r.flat_size.replace(/_/g, ' ')}</th><td className="p-2 break-words">{d(taskLabels[r.task])}<span className="block text-xs text-muted-foreground">{r.source}</span></td><td className="p-2">{money(r.price_inr)}</td><td className="p-2 text-success">~{money(r.worker_estimate_inr)}</td></tr>)}
    </tbody></table></div>
    {community.draft_maid?.some(r => r.task === 'combined') && <section className="space-y-3">
      <h3 className="text-lg font-bold">{d('Combined service examples')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={intensity} onValueChange={setIntensity}><SelectTrigger aria-label={d('Dish workload')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="base">{d('Base price')}</SelectItem>{workloads.map(w => <SelectItem key={w.intensity} value={w.intensity}>{w.label} (+{money(w.extra_inr)})</SelectItem>)}</SelectContent></Select>
        <Select value={slot} onValueChange={setSlot}><SelectTrigger aria-label={d('Time-based adjustments')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="base">{d('Base price')}</SelectItem>{slots.map(s => <SelectItem key={s.slot_time} value={s.slot_time}>{s.slot_time.slice(0, 5)} IST ({money(s.adjustment_inr)})</SelectItem>)}</SelectContent></Select>
      </div>
      {community.draft_maid.filter(r => r.task === 'combined').map(r => {
        const example = extra === undefined || adjustment === undefined ? null : pricingExample(r.price_inr, extra, adjustment, community.commission.percent);
        return <div key={r.flat_size} className="border-b border-border py-3"><p className="font-semibold">{r.flat_size.replace(/_/g, ' ')}</p>{example ? <dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><dt>{d('Customer charge')}</dt><dd>{money(example.total)}</dd><dt>{d('Community service fee')}</dt><dd>{money(example.fee)}</dd><dt>{d('Estimated Earnings')}</dt><dd className="font-bold text-success">~{money(example.estimate)}</dd></dl> : <p>{d('Pricing unavailable')}</p>}</div>;
      })}
      <p className="text-sm text-muted-foreground">{d('Customer-specific charges are excluded from these estimates.')}</p>
    </section>}
  </div>;
}