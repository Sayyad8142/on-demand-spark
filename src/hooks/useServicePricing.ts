import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { parsePricingCatalogue, SERVICE_PRICING_ENABLED, type PricingCatalogue } from '@/lib/servicePricing';

export function useServicePricing(userId:string|undefined,selected:string) {
  const [state,setState]=useState<{owner?:string;data:PricingCatalogue|null;loading:boolean;error:boolean}>({data:null,loading:false,error:false});
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const ticket=++sequence.current;
    if(!userId || !SERVICE_PRICING_ENABLED){setState({owner:userId,data:null,loading:false,error:true});return;}
    setState(s=>({owner:userId,data:s.owner===userId?s.data:null,loading:true,error:false}));
    try {
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError || user?.id!==userId) throw new Error('session');
      const request=()=>supabase.functions.invoke('worker-service-pricing',{body:selected?{community_id:selected}:{}});
      let result=await request();
      if(result.error?.context instanceof Response && result.error.context.status===401){
        const renewed=await supabase.auth.refreshSession();
        if(renewed.error || renewed.data.session?.user.id!==userId) throw new Error('session');
        result=await request();
      }
      if(result.error) throw result.error;
      const data=parsePricingCatalogue(result.data);
      // The requested assigned-only boundary requires Admin-controlled provenance.
      if(data.communities.some(c=>c.association_verification!=='admin_verified')) throw new Error('association_unverified');
      if(ticket===sequence.current) setState({owner:userId,data,loading:false,error:false});
    } catch {
      if(ticket===sequence.current) setState(s=>({owner:userId,data:s.owner===userId?s.data:null,loading:false,error:true}));
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
  return {...state,data:state.owner===userId?state.data:null,refresh};
}