import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NEXT_BOOKING_LIVE_ENABLED, indiaSlot, parseNextSnapshot, type NextSnapshot } from "@/lib/nextBooking";

export function useNextBooking(account: string | undefined, community: string, service: string, enabled = NEXT_BOOKING_LIVE_ENABLED) {
  const [state, setState] = useState<{ owner?: string; scope: string; data: NextSnapshot | null; loading: boolean }>({ scope: "", data: null, loading: false });
  const scope = `${community}/${service}`;
  useEffect(() => {
    if (!enabled || !account) return;
    let disposed = false, nativeActive = true, sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeNative: (() => void) | undefined;
    const visible = () => document.visibilityState !== "hidden" && nativeActive;
    const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const refresh = async () => {
      clear();
      if (disposed || !visible()) return;
      const request = ++sequence;
      // Never label a previous snapshot as current while verifying fresh eligibility.
      setState({ owner: account, scope, data: null, loading: true });
      const timeout = setTimeout(() => {
        if (disposed || request !== sequence) return;
        ++sequence; setState({ owner: account, scope, data: null, loading: false }); schedule();
      }, 10_000);
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (auth.session?.user.id !== account) throw Error("signed_out");
        const { data, error } = await supabase.functions.invoke("worker-availability-ranking", {
          body: { community: community || undefined, service: service || undefined },
          headers: { Authorization: `Bearer ${auth.session.access_token}` },
        });
        if (error) throw Error("unavailable");
        const snapshot = parseNextSnapshot(data);
        if (!disposed && request === sequence && visible()) setState({ owner: account, scope, data: snapshot, loading: false });
      } catch {
        if (!disposed && request === sequence) setState({ owner: account, scope, data: null, loading: false });
      } finally {
        clearTimeout(timeout);
        if (!disposed && request === sequence) schedule();
      }
    };
    const schedule = () => {
      clear();
      if (disposed || !visible()) return;
      timer = setTimeout(refresh, Math.min(15_000, indiaSlot(Date.now()).end - Date.now()));
    };
    const visibility = () => {
      clear(); ++sequence;
      setState({ owner: account, scope, data: null, loading: false });
      if (visible()) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("availabilityChanged", visibility);
    // Current app also announces successful availability changes through this event.
    window.addEventListener("workerAvailabilityChanged", visibility);
    import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
      nativeActive = isActive; visibility();
    })).then(handle => { if (disposed) void handle.remove(); else removeNative = () => { void handle.remove(); }; }).catch(() => undefined);
    void refresh();
    return () => {
      disposed = true; ++sequence; clear(); removeNative?.();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("availabilityChanged", visibility);
      window.removeEventListener("workerAvailabilityChanged", visibility);
    };
  }, [account, community, service, enabled, scope]);
  return state.owner === account && state.scope === scope && enabled ? state : { data: null, loading: false };
}