import { ChevronRight, IndianRupee } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { displayText } from '@/i18n/display';

export default function ServicePricingEntry({communityNames}:{communityNames:string[]}) {
  return <Button asChild variant="outline" className="h-auto w-full justify-start gap-3 rounded-lg bg-card p-4 text-left whitespace-normal">
    <Link to="/service-pricing">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><IndianRupee className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1"><span className="block text-base font-bold">{displayText('Service Pricing & Earnings')}</span>
        <span className="block text-sm font-normal text-muted-foreground">{displayText('Know how much you can earn')}</span>
        <span className="mt-1 block text-sm font-normal text-muted-foreground break-words">{communityNames.length?communityNames.join(' · '):displayText('No assigned community')}</span>
      </span><ChevronRight className="shrink-0 text-muted-foreground" />
    </Link>
  </Button>;
}