import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { SERVICE_PRICING_ENABLED, type PricingCatalogue } from '@/lib/servicePricing';
import { parseServicePricingDraft } from '@/lib/servicePricingDraft';

// The generated DB types cannot include an undeployed RPC. This narrow read-only boundary is removed after deployment.
const requestPricing = () => (supabase as unknown as {
  rpc: (name: 'get_my_service_pricing') => Promise<{ data: unknown; error: { code?: string; status?: number } | null }>;
}).rpc('get_my_service_pricing');

export function useServicePricing(userId:string|undefined,selected:string) {
  const [state,setState]=useState<{owner?:string;selection:string;data:PricingCatalogue|null;loading:boolean;error:boolean}>({selection:'',data:null,loading:false,error:false});
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const ticket=++sequence.current;
    if(!userId || !SERVICE_PRICING_ENABLED){setState({owner:userId,selection:selected,data:null,loading:false,error:true});return;}
    setState(s=>({owner:userId,selection:selected,data:s.owner===userId&&s.selection===selected?s.data:null,loading:true,error:false}));
    let retainCached=false;
    try {
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError || user?.id!==userId) throw new Error('session');
      const request=requestPricing;
      let result=await request();
      if(result.error && (result.error.code==='PGRST301' || result.error.code==='PGRST303' || result.error.status===401)){
        const renewed=await supabase.auth.refreshSession();
        if(renewed.error || renewed.data.session?.user.id!==userId) throw new Error('session');
        result=await request();
      }
      if(result.error) {
        const status=result.error.status;
        retainCached=(status!==undefined && status>=500) || result.error.code===undefined;
        throw result.error;
      }
      const data=parseServicePricingDraft(result.data);
      if(selected && !data.communities.some(c=>c.id===selected)) throw new Error('community_mismatch');
      if(ticket===sequence.current) setState({owner:userId,selection:selected,data,loading:false,error:false});
    } catch {
      if(ticket===sequence.current) setState(s=>({owner:userId,selection:selected,data:retainCached&&s.owner===userId&&s.selection===selected?s.data:null,loading:false,error:true}));
    }
  },[userId,selected]);
  useEffect(()=>{
    void refresh();
    const foreground=()=>{if(document.visibilityState==='visible') void refresh();};
    document.addEventListener('visibilitychange',foreground);window.addEventListener('online',foreground);
    let disposed=false;let remove:(()=>void)|undefined;
    if(Capacitor.isNativePlatform()) void App.addListener('resume',foreground).then(h=>{if(disposed) void h.remove();else remove=()=>{void h.remove();};}).catch(()=>{});
    return()=>{disposed=true;++sequence.current;remove?.();document.removeEventListener('visibilitychange',foreground);window.removeEventListener('online',foreground);};
  },[refresh]);
  return {...state,data:state.owner===userId&&state.selection===selected?state.data:null,refresh};
}