import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, IndianRupee, Clock, Sparkles, Bath, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { displayLocale, displayText, serviceLabel, useWorkerLanguage } from '@/i18n/display';
import { pricingCommunity, readableFlatSize, type PricingCatalogue, type PricingCommunity } from '@/lib/servicePricing';
import { draftFlatGroups } from '@/lib/servicePricingDraft';
import floorPhoto from '@/assets/service-floor-cleaning.webp';
import dishPhoto from '@/assets/service-dish-washing.webp';
import bathroomPhoto from '@/assets/bathroom-training/bathroom_final.webp';
import glassPhoto from '@/assets/bathroom-training/bathroom_glass.webp';

interface Props {
  data: PricingCatalogue | null; loading: boolean; error: boolean; selected: string;
  choices: Array<{ id: string; name: string }>; onSelect: (id: string) => void; onRefresh: () => void; actualEarnings?: ReactNode;
}
const amount = (v: number) => new Intl.NumberFormat(displayLocale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const updatedAt = (v: string) => { const t = new Date(v); return Number.isFinite(t.getTime()) ? new Intl.DateTimeFormat(displayLocale(), { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(t) : ''; };
const d = displayText;
const taskLabels = { floor_cleaning: 'Jhadoo Pocha', dish_washing: 'Dishwashing', combined: 'Jhadoo Pocha + Dishwashing' } as const;

function PriceBar({ label, value, max, strong }: { label: string; value: number; max: number; strong?: boolean }) {
  return <div className="space-y-1">
    <div className="flex items-baseline justify-between gap-2"><span className="text-sm">{label}</span><span className={strong ? 'text-lg font-bold text-success' : 'text-base font-semibold'}>{amount(value)}</span></div>
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${strong ? 'bg-success' : 'bg-primary/60'}`} style={{ width: `${max > 0 ? Math.max(6, (value / max) * 100) : 0}%` }} /></div>
  </div>;
}

function MaidSection({ c }: { c: PricingCommunity }) {
  const groups = draftFlatGroups(c.draft_maid);
  const [flat, setFlat] = useState(groups[0]?.flat_size ?? '');
  const tasks = groups.find(g => g.flat_size === flat)?.tasks ?? [];
  const max = Math.max(1, ...tasks.map(t => t.price_inr));
  const maid = c.services.find(s => s.service_key === 'maid');
  const workloads = maid?.service_key === 'maid' ? maid.dish_workloads : [];
  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="grid grid-cols-2">{[[floorPhoto, 'Jhadoo Pocha'], [dishPhoto, 'Dishwashing']].map(([src, label]) => <img key={label} src={src} alt={d(label)} className="aspect-[4/3] w-full object-cover" />)}</div>
    <div className="space-y-5 p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-success" />{serviceLabel('maid')}</h2>
      {groups.length > 0 && <>
        <div><p className="mb-2 text-sm text-muted-foreground">{d('Flat Size')}</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{groups.map(g => <button key={g.flat_size} type="button" onClick={() => setFlat(g.flat_size)} aria-pressed={g.flat_size === flat}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${g.flat_size === flat ? 'border-success bg-success text-success-foreground' : 'border-border bg-background'}`}>{readableFlatSize(g.flat_size)}</button>)}</div></div>
        <div className="space-y-4">{tasks.map(t => <PriceBar key={t.task} label={d(taskLabels[t.task])} value={t.price_inr} max={max} strong={t.task === 'combined'} />)}</div>
      </>}
      {workloads.length > 0 && <div><h3 className="mb-2 flex items-center gap-2 text-base font-bold"><Utensils className="h-4 w-4" />{d('Extra for more dishes')}</h3>
        <div className="grid grid-cols-3 gap-2">{workloads.map(w => <div key={w.intensity} className="rounded-xl bg-muted p-3 text-center"><p className="text-sm font-semibold">{w.label}</p><p className="text-xs text-muted-foreground">{w.description}</p><p className="mt-1 text-lg font-bold text-success">+{amount(w.extra_inr)}</p></div>)}</div></div>}
    </div>
  </section>;
}

function BathroomSection({ c }: { c: PricingCommunity }) {
  const b = c.services.find(s => s.service_key === 'bathroom_cleaning');
  if (b?.service_key !== 'bathroom_cleaning') return null;
  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="space-y-4 p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Bath className="h-5 w-5 text-success" />{serviceLabel('bathroom_cleaning')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <figure className="rounded-xl bg-muted p-2"><img src={bathroomPhoto} alt={d('Bathroom Cleaning')} className="aspect-square w-full rounded-lg object-cover" /><figcaption className="pt-2 text-center"><span className="block text-sm">{d('Per bathroom')}</span><span className="text-xl font-bold text-success">{amount(b.unit_price_inr)}</span></figcaption></figure>
        <figure className="rounded-xl bg-muted p-2"><img src={glassPhoto} alt={d('Glass Cleaning')} className="aspect-square w-full rounded-lg object-cover" /><figcaption className="pt-2 text-center"><span className="block text-sm">{d('Glass Cleaning')}</span><span className="text-xl font-bold text-success">+{amount(b.glass_partition_price_inr)}</span></figcaption></figure>
      </div>
    </div>
  </section>;
}

function SlotSection({ c }: { c: PricingCommunity }) {
  const keys = (['maid', 'bathroom_cleaning'] as const).filter(k => c.slots.some(s => s.service_key === k && s.adjustment_inr !== 0));
  const [key, setKey] = useState<string>(keys[0] ?? '');
  if (!keys.length) return null;
  const active = keys.includes(key as typeof keys[number]) ? key : keys[0];
  const slots = c.slots.filter(s => s.service_key === active && s.adjustment_inr !== 0);
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
    <h2 className="flex items-center gap-2 text-xl font-bold"><Clock className="h-5 w-5 text-success" />{d('Extra by time')}</h2>
    {keys.length > 1 && <div className="grid grid-cols-2 gap-2 rounded-full bg-muted p-1">{keys.map(k => <button key={k} type="button" onClick={() => setKey(k)} aria-pressed={k === active} className={`rounded-full py-2 text-sm font-semibold ${k === active ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{serviceLabel(k)}</button>)}</div>}
    <div className="grid grid-cols-3 gap-2">{slots.map(s => <div key={s.slot_time} className="rounded-xl bg-muted py-2 text-center"><p className="text-sm">{s.slot_time.slice(0, 5)}</p><p className={`font-bold ${s.adjustment_inr > 0 ? 'text-success' : ''}`}>{s.adjustment_inr > 0 ? '+' : ''}{amount(s.adjustment_inr)}</p></div>)}</div>
  </section>;
}

/** Read-only, simple mobile pricing screen. Prices come only from the server. */
export default function ServicePricingView({ data, loading, selected, choices, onSelect, onRefresh }: Props) {
  useWorkerLanguage();
  const touchStart = useRef<number | null>(null);
  const community = pricingCommunity(data, selected);
  return <main className="min-h-screen bg-background pb-10 text-foreground"
    onTouchStart={e => { touchStart.current = window.scrollY <= 0 ? e.touches[0]?.clientY ?? null : null; }}
    onTouchEnd={e => { const s = touchStart.current; touchStart.current = null; if (s !== null && (e.changedTouches[0]?.clientY ?? s) - s >= 80 && !loading) onRefresh(); }}
    onTouchCancel={() => { touchStart.current = null; }}>
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
        <Button asChild variant="ghost" size="icon" title={d('Back')}><Link to="/profile" aria-label={d('Back')}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-bold">{d('Service Prices')}</h1>
          {community && <p className="truncate text-sm text-muted-foreground">{community.name}</p>}</div>
        <Button variant="ghost" size="icon" title={d('Refresh')} aria-label={d('Refresh')} onClick={onRefresh} disabled={loading}><RefreshCw className={`h-5 w-5 ${loading ? 'motion-safe:animate-spin' : ''}`} /></Button>
      </div>
    </header>
    <div className="mx-auto max-w-md space-y-4 px-3 pt-4">
      {choices.length > 1 && <Select value={selected} onValueChange={onSelect}><SelectTrigger aria-label={d('Assigned community')} className="h-12 rounded-xl text-base"><SelectValue /></SelectTrigger><SelectContent>{choices.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>}
      {loading && !community ? <div role="status" className="py-16 text-center text-muted-foreground">{d('Loading...')}</div> : !community ?
        <section className="py-12 text-center" aria-live="polite">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success"><IndianRupee className="h-8 w-8" /></div>
          <h2 className="text-lg font-bold">{data?.communities.length === 0 ? d('No assigned community') : d('Pricing unavailable')}</h2>
          <Button variant="outline" onClick={onRefresh} className="mt-5 gap-2" disabled={loading}><RefreshCw className="h-4 w-4" />{d('Retry')}</Button>
        </section> : <>
        <MaidSection key={`m-${community.id}`} c={community} />
        <BathroomSection c={community} />
        <SlotSection key={`s-${community.id}`} c={community} />
        {(data?.last_updated_at ?? data?.generated_at) && <p className="text-center text-xs text-muted-foreground">{d('Last successful update')}: {updatedAt(data?.last_updated_at ?? data?.generated_at ?? '')} IST</p>}
      </>}
    </div>
  </main>;
}
