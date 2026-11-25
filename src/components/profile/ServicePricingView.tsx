import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, IndianRupee, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { displayLocale, displayText, serviceLabel, useWorkerLanguage } from '@/i18n/display';
import { pricingCommunity, pricingSnapshotFresh, readableFlatSize, type PricingCatalogue } from '@/lib/servicePricing';
import floorPhoto from '@/assets/service-floor-cleaning.webp';
import dishPhoto from '@/assets/service-dish-washing.webp';
import bathroomPhoto from '@/assets/bathroom-training/bathroom_final.webp';
import glassPhoto from '@/assets/bathroom-training/bathroom_glass.webp';
import DraftPricingRows from './DraftPricingRows';
import { pricingExample } from '@/lib/servicePricingDraft';

interface Props {
  data: PricingCatalogue | null;
  loading: boolean;
  error: boolean;
  selected: string;
  choices: Array<{ id: string; name: string }>;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  actualEarnings?: ReactNode;
}
const amount = (value: number) => new Intl.NumberFormat(displayLocale(), { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const updatedAt = (value: string) => new Intl.DateTimeFormat(displayLocale(), { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

/** Read-only pricing. Actual money is server readback; draft examples never authorize payouts. */
export default function ServicePricingView({ data, loading, error, selected, choices, onSelect, onRefresh, actualEarnings }: Props) {
  useWorkerLanguage();
  const touchStart = useRef<number | null>(null);
  const community = pricingCommunity(data, selected);
  const d = displayText;
  return <main className="min-h-screen bg-background text-foreground"
    onTouchStart={e => { touchStart.current = window.scrollY <= 0 ? e.touches[0]?.clientY ?? null : null; }}
    onTouchEnd={e => { const start = touchStart.current; touchStart.current = null; if (start !== null && (e.changedTouches[0]?.clientY ?? start) - start >= 80 && !loading) onRefresh(); }}
    onTouchCancel={() => { touchStart.current = null; }}>
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
        <Button asChild variant="ghost" size="icon" className="shrink-0" title={d('Back')}><Link to="/profile" aria-label={d('Back')}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="min-w-0 flex-1 text-xl font-bold break-words">{d('Service Pricing & Earnings')}</h1>
        <Button variant="ghost" size="icon" className="shrink-0" title={d('Refresh')} aria-label={d('Refresh')} onClick={onRefresh} disabled={loading}><RefreshCw className={`h-5 w-5 ${loading ? 'motion-safe:animate-spin' : ''}`} /></Button>
      </div>
    </header>
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {choices.length > 1 ? <div className="space-y-2"><label id="pricing-community-label" className="text-sm text-muted-foreground">{d('Assigned community')}</label>
        <Select value={selected} onValueChange={onSelect}><SelectTrigger aria-labelledby="pricing-community-label" className="h-auto min-h-12 text-base [&>span]:line-clamp-none [&>span]:break-words"><SelectValue /></SelectTrigger><SelectContent>{choices.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      </div> : <p className="text-lg font-semibold break-words">{community?.name ?? choices[0]?.name ?? d('No assigned community')}</p>}
      {loading && !community ? <div role="status" className="py-10 text-center text-muted-foreground">{d('Loading...')}</div> : !community ?
        <section className="py-8 text-center" aria-live="polite">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-success"><IndianRupee className="h-9 w-9" /></div>
          <h2 className="text-xl font-bold">{data?.communities.length === 0 ? d('No assigned community') : d('Pricing unavailable')}</h2>
          <p className="mx-auto mt-3 max-w-sm text-base text-muted-foreground">{d('Verified pricing is not available yet.')}</p>
          <Button variant="outline" onClick={onRefresh} className="mt-6 gap-2" disabled={loading}><RefreshCw className="h-4 w-4" />{d('Retry')}</Button>
        </section> : <>
        <section className="space-y-2 border-l-4 border-success pl-4" aria-live="polite">
          <h2 className="text-lg font-bold">{d('Reference rates')}</h2>
          <p>{d('These are customer prices, not confirmed worker earnings.')}</p>
          <p className="text-sm text-muted-foreground">{d('Pricing may differ at booking')}</p>
          {error && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{d('Pricing could not be refreshed.')}</p>}
          {(error || loading || !navigator.onLine || !pricingSnapshotFresh(data?.generated_at ?? '')) && <p className="font-semibold">{d('Saved prices · not live')}</p>}
          <p className="text-sm text-muted-foreground">{d('Last successful update')}: {updatedAt(data?.last_updated_at ?? data?.generated_at ?? '')} IST</p>
        </section>
        <Accordion type="multiple" defaultValue={community.services.map(s => s.service_key)} key={community.id}>
          {community.services.map(service => <AccordionItem key={service.service_key} value={service.service_key}>
            <AccordionTrigger className="text-xl font-bold">{serviceLabel(service.service_key)}</AccordionTrigger>
            <AccordionContent className="space-y-5">
              {service.service_key === 'maid' ? <>
                <div className="grid grid-cols-2 gap-3">{[[floorPhoto, 'Floor Cleaning'], [dishPhoto, 'Dishwashing']].map(([src, label]) => <figure key={label}><img src={src} alt={d(label)} className="aspect-[4/3] w-full rounded-lg object-contain bg-muted" /><figcaption className="pt-2 text-base font-semibold">{d(label)}</figcaption></figure>)}</div>
                {community.draft_maid ? <DraftPricingRows key={community.id} community={community} /> : <div className="overflow-x-auto"><table className="w-full table-fixed text-sm"><thead className="bg-muted"><tr>{['Flat Size', 'Floor Cleaning', 'Dishwashing', 'Both Services'].map(label => <th className="p-2 text-left align-bottom break-words" key={label}>{d(label)}</th>)}</tr></thead><tbody>
                  {service.flat_sizes.map(flat => <tr key={flat.flat_size} className="border-b border-border"><th className="p-2 text-left font-medium break-words">{readableFlatSize(flat.flat_size)}</th><td className="p-2 break-words">{amount(flat.floor_cleaning_inr)}</td><td className="p-2 break-words">{amount(flat.dish_washing_light_inr)}</td><td className="p-2 font-bold text-success break-words">{amount(flat.combined_light_inr)}{flat.combined_discount_inr > 0 && <span className="block text-xs font-normal text-muted-foreground">{d('Discount included')}: {amount(flat.combined_discount_inr)}</span>}</td></tr>)}
                </tbody></table></div>}
                <h3 className="text-lg font-bold">{d('Extra Dishwashing Earnings')}</h3>
                <div className="grid gap-3 sm:grid-cols-3">{service.dish_workloads.map(workload => <article key={workload.intensity} className="rounded-lg border border-border p-4"><h4 className="text-lg font-semibold">{workload.label}</h4><p className="mt-1 text-base text-muted-foreground">{workload.description}</p><p className="mt-3 text-xl font-bold text-success">+{amount(workload.extra_inr)}</p><p className="mt-1 text-xs text-muted-foreground">{d('Additional customer charge')}</p></article>)}</div>
              </> : <>
                <p className="text-base">{d('Standard cleaning per bathroom')}: <strong className="text-success">{amount(service.unit_price_inr)}</strong></p>
                {community.draft_maid && (() => { const e = pricingExample(service.unit_price_inr, 0, 0, community.commission.percent); return e && <p>{d('Estimated Earnings')}: <strong className="text-success">~{amount(e.estimate)}</strong></p>; })()}
                <div className="grid grid-cols-2 gap-3">{[[bathroomPhoto, 'Without Glass Partition'], [glassPhoto, 'With Glass Partition']].map(([src, label]) => <figure key={label}><img src={src} alt={d(label)} className="aspect-[4/3] w-full rounded-lg object-contain bg-muted" /><figcaption className="pt-2 text-base font-semibold">{d(label)}</figcaption></figure>)}</div>
                <p className="text-base">{d('Additional charge per bathroom')}: <strong className="text-success">+{amount(service.glass_partition_price_inr)}</strong></p>{!community.draft_maid && <p className="text-sm text-muted-foreground">{d('Applies to all selected bathrooms')}</p>}
                {community.draft_maid && (() => { const e = pricingExample(service.unit_price_inr, service.glass_partition_price_inr, 0, community.commission.percent); return e && <p>{d('With Glass Partition')} · {d('Estimated Earnings')}: <strong className="text-success">~{amount(e.estimate)}</strong></p>; })()}
              </>}
              {community.slots.some(s => s.service_key === service.service_key) && <section><h3 className="mb-3 text-lg font-bold">{d('Time-based adjustments')}</h3><div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">{community.slots.filter(s => s.service_key === service.service_key).map(slot => <p key={slot.slot_time} className="flex justify-between gap-2 border-b border-border py-2"><span>{slot.slot_time.slice(0, 5)} IST</span><strong>{slot.adjustment_inr > 0 ? '+' : ''}{amount(slot.adjustment_inr)}</strong></p>)}</div></section>}
            </AccordionContent>
          </AccordionItem>)}
        </Accordion>
        {community.services.length === 0 && <p>{d('No service prices available')}</p>}
        {community.loyalty.admin_tiers.length > 0 && <section className="space-y-3"><h3 className="text-lg font-bold">{d('Customer-based charges')}</h3><p className="text-sm text-muted-foreground">{d('Completed customer bookings')}</p>{community.loyalty.admin_tiers.map(tier => <p key={tier.min_completed} className="flex justify-between border-b border-border py-2"><span>{tier.min_completed}{tier.max_completed === null ? '+' : `–${tier.max_completed}`}</span><strong>{amount(tier.surcharge_inr)}</strong></p>)}</section>}
        {community.loyalty_note && <p className="text-sm text-muted-foreground">{community.loyalty_note}</p>}
        <p>{d('Community service fee')}: <strong>{community.commission.percent}%</strong></p>
      </>}
      <section className="border-t border-border pt-5"><h2 className="text-lg font-bold">{d('Actual earnings')}</h2>{actualEarnings}<p className="mt-2 text-muted-foreground">{d('Confirmed earnings are shown in your earnings history.')}</p><Button asChild variant="outline" className="mt-4 gap-2"><Link to="/earnings"><IndianRupee className="h-4 w-4" />{d('View Earnings')}</Link></Button></section>
    </div>
  </main>;
}