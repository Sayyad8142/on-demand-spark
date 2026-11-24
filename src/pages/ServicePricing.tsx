import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useServicePricing } from '@/hooks/useServicePricing';
import ServicePricingView from '@/components/profile/ServicePricingView';

export default function ServicePricing() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [selection, setSelection] = useState<{ owner?: string; id: string }>({ id: '' });
  const selected = selection.owner === userId ? selection.id : '';
  const result = useServicePricing(userId, selected);
  const known = useRef<{ owner?: string; choices: Array<{ id: string; name: string }> }>({ choices: [] });
  const returned = result.data?.communities.map(c => ({ id: c.id, name: c.name }));
  useEffect(() => {
    if (!selected && returned) {
      known.current = { owner: userId, choices: returned };
      const first = returned[0];
      if (first) setSelection({ owner: userId, id: first.id });
    }
  }, [userId, selected, result.data]);
  const choices = !selected && returned ? returned : known.current.owner === userId ? known.current.choices : [];
  return <ServicePricingView {...result} selected={selected} choices={choices}
    onSelect={id => { if (choices.some(c => c.id === id)) setSelection({ owner: userId, id }); }}
    onRefresh={() => { void result.refresh(); }} />;
}