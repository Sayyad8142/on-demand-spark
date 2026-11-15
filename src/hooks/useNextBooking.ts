import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NEXT_BOOKING_LIVE_ENABLED, indiaSlot, parseNextSnapshot, type NextSnapshot } from "@/lib/nextBooking";

export type NextBookingError = "disabled" | "auth" | "unavailable" | "connection" | "invalid";
export function useNextBooking(account: string | undefined, community: string, service: string, enabled = NEXT_BOOKING_LIVE_ENABLED) {
  const [state, setState] = useState<{ owner?: string; scope: string; data: NextSnapshot | null; loading: boolean; error: NextBookingError | null }>({ scope: "", data: null, loading: false, error: null });
  const refreshRef = useRef<(() => Promise<void>) | undefined>();
  const retry = useCallback(() => { void refreshRef.current?.(); }, []);
  const scope = `${community}/${service}`;
  useEffect(() => {
    if (!enabled || !account) return;
    let disposed = false, nativeActive = true, sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeNative: (() => void) | undefined;
    let removeRealtime: (() => void) | undefined;
    const visible = () => document.visibilityState !== "hidden" && nativeActive;
    const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const refresh = async () => {
      clear();
      if (disposed || !visible()) return;
      const request = ++sequence;
      // Never label a previous snapshot as current while verifying fresh eligibility.
      setState({ owner: account, scope, data: null, loading: true, error: null });
      const timeout = setTimeout(() => {
        if (disposed || request !== sequence) return;
        ++sequence; setState({ owner: account, scope, data: null, loading: false, error: "connection" }); schedule();
      }, 10_000);
      try {
        const { data: auth, error: sessionError } = await supabase.auth.getSession();
        let session = auth.session;
        if (sessionError || session?.user.id !== account) throw Error("auth");
        if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
          const refreshed = await supabase.auth.refreshSession();
          session = refreshed.data.session;
          if (refreshed.error || session?.user.id !== account) throw Error("auth");
        }
        if (disposed || request !== sequence || !visible()) return;
        const invoke = (token: string) => supabase.functions.invoke("worker-availability-ranking", {
          body: { community: community || undefined, service: service || undefined },
          headers: { Authorization: `Bearer ${token}` },
        });
        let result = await invoke(session.access_token);
        if (result.error?.context?.status === 401) {
          const refreshed = await supabase.auth.refreshSession();
          const fresh = refreshed.data.session;
          if (refreshed.error || fresh?.user.id !== account) throw Error("auth");
          if (disposed || request !== sequence || !visible()) return;
          result = await invoke(fresh.access_token);
        }
        if (result.error) {
          const status = result.error.context?.status;
          throw Error(status === 401 || status === 403 ? "auth" : status === 404 ? "unavailable" : "connection");
        }
        let snapshot: NextSnapshot;
        try { snapshot = parseNextSnapshot(result.data); } catch { throw Error("invalid"); }
        if (!disposed && request === sequence && visible()) setState({ owner: account, scope, data: snapshot, loading: false, error: null });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "connection";
        const error: NextBookingError = message === "auth" || message === "unavailable" || message === "invalid" ? message : "connection";
        if (!disposed && request === sequence) setState({ owner: account, scope, data: null, loading: false, error });
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
      setState({ owner: account, scope, data: null, loading: false, error: null });
      if (visible()) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("availabilityChanged", visibility);
    window.addEventListener("workerAvailabilityChanged", visibility);
    // Own-worker RLS read only, never broader worker access or schedule loading.
    void supabase.from("workers").select("id").eq("user_id", account).maybeSingle().then(({ data, error }) => {
      if (disposed || error || !data?.id) return;
      const channel = supabase.channel(`next-availability-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workers", filter: `id=eq.${data.id}` }, visibility)
        .on("postgres_changes", { event: "*", schema: "public", table: "worker_availability", filter: `worker_id=eq.${data.id}` }, visibility)
        .subscribe();
      removeRealtime = () => { void supabase.removeChannel(channel); };
    });
    import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
      nativeActive = isActive; visibility();
    })).then(handle => { if (disposed) void handle.remove(); else removeNative = () => { void handle.remove(); }; }).catch(() => undefined);
    refreshRef.current = refresh;
    void refresh();
    return () => {
      disposed = true; ++sequence; refreshRef.current = undefined; clear(); removeNative?.(); removeRealtime?.();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("availabilityChanged", visibility);
      window.removeEventListener("workerAvailabilityChanged", visibility);
    };
  }, [account, community, service, enabled, scope]);
  return { ...(state.owner === account && state.scope === scope && enabled && account ? state : { data: null, loading: false, error: !enabled ? "disabled" as const : !account ? "auth" as const : null }), retry };
}